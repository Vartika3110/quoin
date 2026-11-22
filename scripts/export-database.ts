/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Prisma, PrismaClient } from "@prisma/client";
import { encodeRow } from "../src/lib/backup/serialise";

/**
 * Take a copy of the database that does not live in Supabase.
 *
 *   npx tsx scripts/export-database.ts                 # write a new export
 *   npx tsx scripts/export-database.ts --verify <dir>  # check one already written
 *
 * ## What this is, and what it is not
 *
 * It is **the data**, not the database. Every row of every table, as
 * gzipped NDJSON, with a manifest recording the counts and a SHA-256 of
 * each file. It is not `pg_dump`: there is no schema here, no
 * sequences, no indexes, no grants, and nothing from Supabase's own
 * `auth` schema — Prisma can only see the tables it models.
 *
 * So the honest description is **"rebuild from this", not "restore
 * this"**. The schema is recoverable from `prisma/migrations`, which is
 * in git; the data is not recoverable from anywhere, which is why it is
 * this half that gets written down. Together they are a rebuild.
 *
 * It exists because the alternative, today, is nothing at all. The
 * Supabase project carries no automatic backups on its current plan, and
 * a 21MB database is small enough that there is no excuse for that. A
 * `pg_dump` taken off-platform is strictly better and needs
 * `brew install libpq`; this needs nothing, so it is the one that can be
 * running tonight.
 *
 * ## Where the output goes, and why that matters
 *
 * `backups/` by default, which is git-ignored by this script's own
 * doing — see `ensureIgnored`. **The output contains personal data**:
 * customer names, phone numbers, delivery addresses and order history.
 * It is a database, so of course it does; but a database behind a
 * password and a folder in a repository are different exposures, and
 * the second one is an accident away from a public commit.
 *
 * ## Reading rows
 *
 * Paged by primary key where a model has a single-column one, which is
 * all of them today. `findMany` with a cursor rather than `skip`: skip
 * makes Postgres count past the rows it is skipping, so the last page of
 * a large table costs as much as the whole scan.
 */

const BATCH = 1000;

interface TableReport {
  model: string;
  table: string;
  rows: number;
  bytes: number;
  sha256: string;
  file: string;
}

async function main() {
  const verifyIndex = process.argv.indexOf("--verify");
  if (verifyIndex !== -1) {
    await verify(process.argv[verifyIndex + 1]);
    return;
  }

  const db = new PrismaClient();
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outDir = path.join(argOr("--out", "backups"), stamp);
    await mkdir(outDir, { recursive: true });
    await ensureIgnored();

    const models = Prisma.dmmf.datamodel.models;
    console.log(`${models.length} models → ${outDir}`);

    const tables: TableReport[] = [];
    for (const model of models) {
      const report = await exportModel(db, model, outDir);
      tables.push(report);
      console.log(
        `  ${String(report.rows).padStart(7)} rows  ${(report.bytes / 1024).toFixed(0).padStart(6)} KB  ${report.model}`,
      );
    }

    const manifest = {
      takenAt: new Date().toISOString(),
      /* The host, never the credentials. A manifest is the one file in
         here somebody will open in a hurry, and a connection string with
         a password in it is how a backup becomes a breach. */
      database: hostOnly(process.env.DATABASE_URL),
      prisma: Prisma.prismaVersion.client,
      /* The schema half of a rebuild lives in git. Naming the last
         migration is what says *which* schema these rows belong to. */
      migrations: await migrationNames(),
      totals: {
        tables: tables.length,
        rows: tables.reduce((sum, t) => sum + t.rows, 0),
        bytes: tables.reduce((sum, t) => sum + t.bytes, 0),
      },
      tables,
    };
    await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);

    console.log(
      `\n${manifest.totals.rows} rows in ${manifest.totals.tables} tables, ` +
        `${(manifest.totals.bytes / 1048576).toFixed(1)} MB gzipped`,
    );
    console.log(`\nVerify it with:\n  npx tsx scripts/export-database.ts --verify ${outDir}`);
    console.log(
      "\nThis is the data, not the database — the schema is in prisma/migrations.\n" +
        "It holds customer names, numbers and addresses: keep it off shared drives.",
    );
  } finally {
    await db.$disconnect();
  }
}

/** One model to one gzipped NDJSON file, paged by its primary key. */
async function exportModel(
  db: PrismaClient,
  model: Prisma.DMMF.Model,
  outDir: string,
): Promise<TableReport> {
  const delegate = (db as unknown as Record<string, DelegateLike>)[lowerFirst(model.name)];
  const file = `${model.dbName ?? model.name}.ndjson.gz`;
  const target = path.join(outDir, file);

  const hash = createHash("sha256");
  const gzip = createGzip();
  const written = pipeline(gzip, createWriteStream(target));

  /* A single-column primary key is what makes cursor paging possible.
     Every model has one today; a future composite key would land here
     and take the unpaged path rather than silently exporting one page. */
  const key = model.primaryKey === null ? model.fields.find((f) => f.isId)?.name : undefined;

  let rows = 0;
  let cursor: Record<string, unknown> | undefined;

  for (;;) {
    const batch: Record<string, unknown>[] = await delegate.findMany({
      take: BATCH,
      ...(key ? { orderBy: { [key]: "asc" } } : {}),
      ...(cursor ? { cursor, skip: 1 } : {}),
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const line = `${encodeRow(row)}\n`;
      hash.update(line);
      if (!gzip.write(line)) await new Promise((resolve) => gzip.once("drain", resolve));
      rows += 1;
    }

    if (!key || batch.length < BATCH) break;
    cursor = { [key]: batch[batch.length - 1][key] };
  }

  gzip.end();
  await written;

  return {
    model: model.name,
    table: model.dbName ?? model.name,
    rows,
    bytes: (await stat(target)).size,
    /* Over the uncompressed lines, not the gzip: the same rows gzip to
       different bytes on different zlib versions, and what is being
       checked is the data, not the compressor. */
    sha256: hash.digest("hex"),
    file,
  };
}

/**
 * Reads an export back and checks it against its own manifest.
 *
 * This is the half that makes it a backup rather than a file. It
 * re-reads every line, re-parses it, and recomputes the hash — so a
 * truncated write, a half-finished gzip or a corrupted disk is found
 * now rather than on the morning somebody needs it.
 *
 * It does **not** compare against the live database. An export is a
 * photograph of a moment; the database has moved on, and a diff would
 * report every order taken since as a failure.
 */
async function verify(dir: string | undefined) {
  if (!dir) throw new Error("--verify needs the export directory");

  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as {
    takenAt: string;
    totals: { rows: number };
    tables: TableReport[];
  };

  const { createReadStream } = await import("node:fs");
  const { createGunzip } = await import("node:zlib");
  const { createInterface } = await import("node:readline");
  const { decodeRow } = await import("../src/lib/backup/serialise");

  let bad = 0;
  let rows = 0;

  for (const table of manifest.tables) {
    const hash = createHash("sha256");
    let counted = 0;

    const lines = createInterface({
      input: createReadStream(path.join(dir, table.file)).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (line === "") continue;
      /* Parsed, not just hashed: a file can hash correctly and still be
         unreadable if the writer produced something JSON cannot take
         back. The decode is the test. */
      decodeRow(line);
      hash.update(`${line}\n`);
      counted += 1;
    }

    const digest = hash.digest("hex");
    const ok = counted === table.rows && digest === table.sha256;
    if (!ok) {
      bad += 1;
      console.log(
        `  FAILED ${table.model}: ${counted} rows (manifest says ${table.rows}), ` +
          `hash ${digest === table.sha256 ? "matches" : "differs"}`,
      );
    }
    rows += counted;
  }

  console.log(
    bad === 0
      ? `\nAll ${manifest.tables.length} tables readable, ${rows} rows, every hash matches.\n` +
          `Taken ${manifest.takenAt}.`
      : `\n${bad} of ${manifest.tables.length} tables FAILED. This export cannot be trusted.`,
  );
  if (bad > 0) process.exitCode = 1;
}

/**
 * Puts `backups/` in `.gitignore` if it is not already there.
 *
 * Done by the script rather than left to whoever runs it, because the
 * cost of forgetting is a repository with every customer's phone number
 * in its history — and a `.gitignore` line is cheap enough that there is
 * no argument for making it somebody's responsibility to remember.
 */
async function ensureIgnored() {
  const file = ".gitignore";
  const current = await readFile(file, "utf8").catch(() => "");
  if (/^\/?backups\/?$/m.test(current)) return;
  await writeFile(
    file,
    `${current.replace(/\n*$/, "\n")}\n# Database exports — rows, not schema, and full of personal data.\n/backups\n`,
  );
  console.log("added /backups to .gitignore");
}

async function migrationNames(): Promise<string[]> {
  const entries = await readdir("prisma/migrations", { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/** `postgresql://user:pass@host:5432/db` → `host:5432/db`. */
function hostOnly(url: string | undefined): string {
  if (!url) return "unknown";
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "unparseable";
  }
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function argOr(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

interface DelegateLike {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
