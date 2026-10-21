/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

/**
 * Collapse brand rows that are the same manufacturer twice.
 *
 *   npx tsx scripts/merge-duplicate-brands.ts            # dry run
 *   npx tsx scripts/merge-duplicate-brands.ts --apply
 *   npx tsx scripts/merge-duplicate-brands.ts --restore <backup.json>
 *
 * The import read a brand column written by hand across several source
 * documents, so one manufacturer arrived under two spellings: `Dr Fixit`
 * and `Dr. Fixit`, `Myk Laticrete` and `MYK Laticrete`. `Brand.name` is
 * unique, so both became rows, and the second of each pair took a
 * `-2` slug.
 *
 * That is not only untidy. The storefront's brand filter lists one entry
 * per row, so a shopper filtering to MYK Laticrete sees 11 of its 30
 * products and no indication the rest exist. Worse, the product page
 * links a brand by slugifying its *display name*
 * (`slugifyBrand` in `src/app/p/[slug]/page.tsx`), which maps both
 * spellings onto `myk-laticrete` — so every product on the `-2` row
 * already links to the other row's listing. The duplicate is invisible
 * until it silently halves a listing.
 *
 * Each merge keeps the row whose slug has no `-2` suffix, so no product
 * slug changes: the importer built those from the normalised brand name,
 * which is identical across each pair (`Dr Fixit` and `Dr. Fixit` both
 * slugify to `dr-fixit`). The keeper's *name* is then corrected to the
 * manufacturer's own styling, which is sometimes the loser's spelling —
 * `Dr. Fixit` is how Pidilite writes it, and it held the `-2` slug.
 *
 * Deleting the emptied row is safe: `Product.brandId` is the only
 * relation to `Brand`, and every product is moved off it first.
 *
 * Every run writes a backup of the previous values first, and --restore
 * puts them back. This edits live catalogue rows; it should be possible
 * to undo it without a database restore.
 */
const db = new PrismaClient();

interface Merge {
  /** Slug of the row to keep. Chosen so product slugs stay valid. */
  keepSlug: string;
  /** Slug of the row to empty and delete. */
  dropSlug: string;
  /** The manufacturer's own styling, applied to the keeper. */
  canonicalName: string;
  /** Why this spelling won, for the dry run to be auditable. */
  note: string;
}

/**
 * The duplicates, written out rather than detected.
 *
 * A normalise-and-group pass finds these four, but it would also pair any
 * future brands that happen to collide once punctuation is stripped —
 * and two genuinely different manufacturers are not a merge to make
 * unattended. Four rows is a list; the rule that found them is in the
 * audit, not here.
 */
const MERGES: Merge[] = [
  {
    keepSlug: "dr-fixit",
    dropSlug: "dr-fixit-2",
    canonicalName: "Dr. Fixit",
    note: "Pidilite writes the brand with the full stop.",
  },
  {
    keepSlug: "myk-laticrete",
    dropSlug: "myk-laticrete-2",
    canonicalName: "MYK Laticrete",
    note: "MYK LATICRETE is the joint venture's own capitalisation.",
  },
  {
    keepSlug: "l-t",
    dropSlug: "l-t-2",
    canonicalName: "L&T",
    note: "Larsen & Toubro's initials are both capitals.",
  },
  {
    keepSlug: "ultratech",
    dropSlug: "ultratech-2",
    canonicalName: "UltraTech",
    note: "UltraTech Cement styles the T as a capital.",
  },
];

/**
 * Rows naming two companies at once.
 *
 * `Fevicol ; Pidilite` is one product — a Feviseal sealant — carrying
 * both the line and its maker, separated by the source document's
 * delimiter. The schema's own rule settles which survives: a brand is
 * whose name is on the box, and Pidilite is the manufacturer behind it.
 *
 * Kept apart from `MERGES` because nothing here is a spelling variant:
 * the destination is a different brand, and the product's slug keeps its
 * `fevicol-pidilite-` prefix. Rewriting that slug would break a live URL
 * to fix a string no customer reads, so it is left alone.
 */
const REASSIGN: { fromSlug: string; toName: string; note: string }[] = [
  {
    fromSlug: "fevicol-pidilite",
    toName: "Fevicol",
    note: "Feviseal is the Fevi- family's sealant; Fevicol is the name on the box.",
  },
];

interface Backup {
  /** Products moved, with the brand row they came from. */
  products: { id: string; sku: string; brandId: string | null }[];
  /** Brand rows as they were, so a delete can be undone. */
  brands: { id: string; name: string; slug: string; isActive: boolean }[];
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const restoreAt = args.indexOf("--restore");

  if (restoreAt !== -1) return restore(args[restoreAt + 1]);

  const backup: Backup = { products: [], brands: [] };
  const lines: string[] = [];

  for (const merge of MERGES) {
    const keep = await db.brand.findUnique({ where: { slug: merge.keepSlug } });
    const drop = await db.brand.findUnique({ where: { slug: merge.dropSlug } });

    /* Absent rows are the expected state of a second run, not a fault. */
    if (!keep || !drop) {
      lines.push(`SKIP  ${merge.keepSlug} + ${merge.dropSlug} — already merged`);
      continue;
    }

    const moving = await db.product.findMany({
      where: { brandId: drop.id },
      select: { id: true, sku: true, isActive: true },
    });
    const live = moving.filter((p) => p.isActive).length;

    lines.push(
      `MERGE ${JSON.stringify(drop.name)} (${drop.slug}) -> ` +
        `${JSON.stringify(merge.canonicalName)} (${keep.slug})\n` +
        `        ${moving.length} product(s), ${live} live` +
        (keep.name === merge.canonicalName
          ? ""
          : `\n        rename keeper ${JSON.stringify(keep.name)} -> ${JSON.stringify(merge.canonicalName)}`) +
        `\n        ${merge.note}`,
    );

    if (!apply) continue;

    backup.brands.push({ id: drop.id, name: drop.name, slug: drop.slug, isActive: drop.isActive });
    backup.brands.push({ id: keep.id, name: keep.name, slug: keep.slug, isActive: keep.isActive });
    for (const p of moving) backup.products.push({ id: p.id, sku: p.sku, brandId: drop.id });

    /* One transaction per merge. The rename has to land before the
       delete — both rows normalise to the same name, and `Brand.name` is
       unique, so renaming the keeper while the loser still holds that
       spelling is the one ordering Postgres rejects. */
    await db.$transaction([
      db.product.updateMany({ where: { brandId: drop.id }, data: { brandId: keep.id } }),
      db.brand.delete({ where: { id: drop.id } }),
      db.brand.update({ where: { id: keep.id }, data: { name: merge.canonicalName } }),
    ]);
  }

  for (const move of REASSIGN) {
    const from = await db.brand.findUnique({ where: { slug: move.fromSlug } });
    const to = await db.brand.findUnique({ where: { name: move.toName } });

    if (!from) {
      lines.push(`SKIP  ${move.fromSlug} — already reassigned`);
      continue;
    }
    if (!to) {
      lines.push(`SKIP  ${move.fromSlug} — no brand named ${JSON.stringify(move.toName)}`);
      continue;
    }

    const moving = await db.product.findMany({
      where: { brandId: from.id },
      select: { id: true, sku: true, isActive: true },
    });
    const live = moving.filter((p) => p.isActive).length;

    lines.push(
      `MOVE  ${JSON.stringify(from.name)} (${from.slug}) -> ${JSON.stringify(to.name)} (${to.slug})\n` +
        `        ${moving.length} product(s), ${live} live; product slugs unchanged\n` +
        `        ${move.note}`,
    );

    if (!apply) continue;

    backup.brands.push({ id: from.id, name: from.name, slug: from.slug, isActive: from.isActive });
    for (const p of moving) backup.products.push({ id: p.id, sku: p.sku, brandId: from.id });

    await db.$transaction([
      db.product.updateMany({ where: { brandId: from.id }, data: { brandId: to.id } }),
      db.brand.delete({ where: { id: from.id } }),
    ]);
  }

  console.info(lines.join("\n\n"));

  if (!apply) {
    console.info(`\nDry run. Re-run with --apply to write these changes.`);
    return;
  }

  mkdirSync(path.join(process.cwd(), ".backups"), { recursive: true });
  const backupPath = path.join(
    process.cwd(),
    ".backups",
    `merge-duplicate-brands-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.info(`\nApplied. Backup written to ${backupPath}`);
}

async function restore(file: string | undefined) {
  if (!file) throw new Error("usage: --restore <backup.json>");
  const backup: Backup = JSON.parse(readFileSync(file, "utf8"));

  /* Brands first, and by id: the products point at rows that no longer
     exist, so there is nothing to move them back to until the deleted
     rows are recreated under their original ids. */
  for (const brand of backup.brands) {
    await db.brand.upsert({
      where: { id: brand.id },
      create: brand,
      update: { name: brand.name, slug: brand.slug, isActive: brand.isActive },
    });
  }

  for (const product of backup.products) {
    await db.product.update({
      where: { id: product.id },
      data: { brandId: product.brandId },
    });
  }

  console.info(
    `Restored ${backup.brands.length} brand row(s) and ${backup.products.length} product(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
