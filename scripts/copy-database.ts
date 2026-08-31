/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";

/**
 * Copy every row from one Postgres to another — for moving providers.
 *
 *   npm run db:copy -- --dry-run
 *   npm run db:copy
 *   npm run db:copy -- --force
 *
 * Source is `DATABASE_URL`, target is `TARGET_DATABASE_URL`. The target
 * must already have the schema: run `prisma migrate deploy` against it
 * first. This moves data only, and deliberately so — the schema is
 * Prisma's to create, and a structural dump taken from one provider
 * carries roles, extensions and grants the next one will not accept.
 *
 * Not `pg_dump`: that needs client binaries matching the server's major
 * version, and the whole database is 12 MB. A row copy through Prisma
 * reads the schema the app actually uses and can verify itself at the
 * end, which a dump cannot.
 *
 * Primary keys are carried across unchanged. They are cuids rather than
 * sequences, so nothing has to be resequenced afterwards, and every
 * foreign key still points at the row it did before. That is also why the
 * order below matters: a child cannot be written before its parent.
 *
 * Safe to interrupt and re-run: it refuses a target that already holds
 * rows unless `--force`, which empties it first.
 */

const source = new PrismaClient();

const targetUrl = process.env.TARGET_DATABASE_URL;
if (!targetUrl) {
  console.error(
    "TARGET_DATABASE_URL is not set. Put the new database's connection " +
      "string in .env.local — the pooled one, as the app will use it.",
  );
  process.exit(1);
}

const target = new PrismaClient({ datasourceUrl: targetUrl });

/**
 * Parent before child, so every foreign key resolves as it is written.
 *
 * `Category` is self-referencing (`CategoryTree`), so it is not enough to
 * place it before `Product` — its own rows have to go in parent-first
 * too. That is handled separately below.
 */
const TABLES = [
  "user",
  "otpChallenge",
  "brand",
  "category",
  "serviceArea",
  "address",
  "store",
  "servicePincode",
  "product",
  "productVariant",
  "priceTier",
  "consultRequest",
] as const;

type Table = (typeof TABLES)[number];

/* Prisma generates a differently-typed delegate per model, and there is no
   union that accepts every one of their `createMany` argument shapes. The
   rows are read from the same schema they are written back to, so the
   cast is safe in a way the type system cannot express. */
type Delegate = {
  findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<{ count: number }>;
  count: () => Promise<number>;
  deleteMany: () => Promise<{ count: number }>;
};

const delegate = (client: PrismaClient, table: Table): Delegate =>
  (client as unknown as Record<Table, Delegate>)[table];

/** Postgres caps a statement's parameters, so wide tables go in chunks. */
const BATCH = 500;

/**
 * Order categories so a parent is always written before its children.
 *
 * Every imported category is flat today, so this is a single pass in
 * practice. It exists because the schema permits a tree and a migration
 * that quietly dropped one would be found much later.
 */
function parentsFirst(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const written = new Set<string>();
  const out: Record<string, unknown>[] = [];
  let remaining = rows;

  while (remaining.length > 0) {
    const ready = remaining.filter((r) => {
      const parent = r.parentId as string | null;
      return parent === null || parent === undefined || written.has(parent);
    });

    /* A cycle, or a parent that is not in the export. Neither is
       recoverable here, and writing the rest would silently reparent. */
    if (ready.length === 0) {
      throw new Error(
        `Cannot order ${remaining.length} categories: a parent is missing or the tree is cyclic.`,
      );
    }

    for (const row of ready) {
      written.add(row.id as string);
      out.push(row);
    }
    remaining = remaining.filter((r) => !written.has(r.id as string));
  }

  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  /* Fail before writing anything if the target has no schema. A missing
     table here means `prisma migrate deploy` has not been run, and the
     error Prisma raises mid-copy names a column rather than the cause. */
  const occupied: string[] = [];
  for (const table of TABLES) {
    let count: number;
    try {
      count = await delegate(target, table).count();
    } catch {
      throw new Error(
        `The target has no "${table}" table. Run this against it first:\n` +
          `  DATABASE_URL="<target url>" npx prisma migrate deploy`,
      );
    }
    if (count > 0) occupied.push(`${table} (${count})`);
  }

  /* Reported rather than raised under --dry-run: the point of a dry run is
     to say what the real one would do, and refusing to answer because the
     answer is "it would stop here" is the least useful version of that. */
  if (occupied.length > 0) {
    if (!force && !dryRun) {
      throw new Error(
        `The target is not empty: ${occupied.join(", ")}.\n` +
          "Re-run with --force to delete those rows and copy over them.",
      );
    }
    console.info(
      `target already holds: ${occupied.join(", ")}` +
        (force ? " — --force will clear these first\n" : " — a real run needs --force\n"),
    );
  }

  /* Emptied in one pass up front, children before parents — the reverse of
     the write order. Deleting per table as the copy reached it would leave
     a child pointing at a parent that had just been replaced. */
  if (force && occupied.length > 0 && !dryRun) {
    for (const table of [...TABLES].reverse()) {
      const { count } = await delegate(target, table).deleteMany();
      if (count > 0) console.info(`cleared ${count} from ${table}`);
    }
  }

  const counts: Record<string, { read: number; written: number }> = {};

  for (const table of TABLES) {
    let rows = await delegate(source, table).findMany();
    if (table === "category") rows = parentsFirst(rows);

    counts[table] = { read: rows.length, written: 0 };

    if (dryRun) {
      console.info(`${table}: ${rows.length} rows would be copied`);
      continue;
    }

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { count } = await delegate(target, table).createMany({ data: batch });
      counts[table].written += count;
    }

    console.info(`${table}: copied ${counts[table].written}/${rows.length}`);
  }

  if (dryRun) {
    console.info("\ndry run — nothing written");
    return;
  }

  /* Count both ends rather than trusting the write results. A silently
     skipped row is the failure mode that matters, and it is invisible
     unless the target is asked directly. */
  console.info("\nverifying:");
  const mismatched: string[] = [];
  for (const table of TABLES) {
    const [from, to] = await Promise.all([
      delegate(source, table).count(),
      delegate(target, table).count(),
    ]);
    const ok = from === to;
    if (!ok) mismatched.push(`${table}: source ${from}, target ${to}`);
    console.info(`  ${ok ? "ok  " : "FAIL"} ${table}: ${from} -> ${to}`);
  }

  if (mismatched.length > 0) {
    throw new Error(`Row counts do not match:\n  ${mismatched.join("\n  ")}`);
  }

  console.info("\nevery table matches.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
