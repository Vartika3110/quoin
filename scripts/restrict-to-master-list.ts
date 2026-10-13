/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Cut the shelf down to the owner's own master list.
 *
 *   npx tsx scripts/restrict-to-master-list.ts          # report only
 *   npx tsx scripts/restrict-to-master-list.ts --fix    # ...and deactivate
 *
 * The catalogue holds 3,214 products, imported from supplier PDFs and
 * competitor pages. The owner's master list — the spreadsheet this
 * script's data file was taken from — is 533 products they actually
 * intend to sell. Everything else is to come off the shelf.
 *
 * ## Deactivate, never delete
 *
 * `isActive: false` and nothing more, for three reasons.
 *
 * It is reversible. A list of 533 lines assembled by hand against
 * supplier catalogues will have omissions in it, and the first time one
 * is noticed the answer should be one `UPDATE` rather than a re-import.
 *
 * It keeps the evidence. These rows carry `sourceSku`, `sourceUrl` and
 * the rest of the quarantined provenance fields that record where each
 * came from (see `docs/django-to-prisma.md`). Deleting them throws away
 * the only record of what an import actually produced.
 *
 * And it is the same decision `retire-unbuyable.ts` and
 * `retire-scraped.ts` made before it, for the same reason: what the
 * customer must not see is a listing, and `isActive` is what the
 * storefront reads.
 *
 * ## Matching
 *
 * On `Product.sku` exactly. The spreadsheet's "Reference No." column is
 * that sku — 519 of its 532 references resolve, and the thirteen that do
 * not are not in the database under any name either, so they are
 * products to *add* rather than anything this script should act on. They
 * are reported, not silently dropped.
 *
 * No fuzzy fallback on name or brand. A near-match here deactivates a
 * product the owner wants, or keeps one they do not, and neither failure
 * announces itself — the catalogue carries duplicate names across
 * brands, and "Putty" alone names rows from four suppliers.
 *
 * ## What is left alone
 *
 * Products already inactive are untouched, including the ones *on* the
 * master list: nine of the 533 are off the shelf for a reason that still
 * holds (eight have no photograph — see `reports/deactivated-no-image.json`
 * — and one has `SH` for a name). Switching those on is a separate
 * decision with separate work behind it, so this script reports them and
 * does not take it.
 *
 * Order history is unaffected either way: `OrderLine` snapshots the sku,
 * title and price at the moment of sale and has no foreign key to
 * `Product`, so a past order reads exactly the same afterwards.
 */
const db = new PrismaClient();

const DATA = path.join("scripts", "data", "master-catalogue.json");
const REPORT = path.join("reports", "restricted-to-master-list.json");

interface MasterList {
  source: string;
  unreferenced: { name: string; brand: string }[];
  products: { ref: string; name: string; brand: string }[];
}

async function main() {
  const fix = process.argv.includes("--fix");
  const master: MasterList = JSON.parse(await readFile(DATA, "utf8"));
  const refs = master.products.map((p) => p.ref);

  const [totalProducts, activeBefore] = await Promise.all([
    db.product.count(),
    db.product.count({ where: { isActive: true } }),
  ]);

  const wanted = await db.product.findMany({
    where: { sku: { in: refs } },
    select: { id: true, sku: true, name: true, slug: true, isActive: true, image: true },
  });
  const wantedSkus = new Set(wanted.map((p) => p.sku));
  const absent = master.products.filter((p) => !wantedSkus.has(p.ref));

  /* The ones to take off the shelf: everything the list does not name,
     and only those that are actually on it today. Selecting them before
     the update is what makes the report an undo record rather than a
     description of a change nobody can reverse. */
  const toDeactivate = await db.product.findMany({
    where: { sku: { notIn: refs }, isActive: true },
    select: { id: true, sku: true, name: true, slug: true, brand: { select: { name: true } } },
    orderBy: { sku: "asc" },
  });

  const wantedButInactive = wanted.filter((p) => !p.isActive);

  console.log(`catalogue        ${totalProducts} products, ${activeBefore} active`);
  console.log(`master list      ${master.products.length} references (+${master.unreferenced.length} with no reference)`);
  console.log(`  on the shelf   ${wanted.length - wantedButInactive.length}`);
  console.log(`  off the shelf  ${wantedButInactive.length}  (reported below; left alone)`);
  console.log(`  not in the DB  ${absent.length}  (products to add, not to hide)`);
  console.log(`to deactivate    ${toDeactivate.length}`);
  console.log(`active after     ${activeBefore - toDeactivate.length}`);

  if (absent.length > 0) {
    console.log(`\nOn the list, not in the catalogue — add these:`);
    for (const p of absent) {
      console.log(`  ${p.ref.padEnd(16)} ${p.brand.padEnd(14)} ${p.name}`);
    }
  }

  if (wantedButInactive.length > 0) {
    console.log(`\nOn the list but currently hidden — each needs a decision:`);
    for (const p of wantedButInactive) {
      console.log(`  ${p.sku.padEnd(16)} ${p.image ? "has an illustration" : "no photograph    "} ${p.name}`);
    }
  }

  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(
    REPORT,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        applied: fix,
        source: master.source,
        catalogueBefore: { products: totalProducts, active: activeBefore },
        kept: wanted.map((p) => ({ sku: p.sku, name: p.name, wasActive: p.isActive })),
        absentFromCatalogue: absent,
        unreferencedRows: master.unreferenced,
        /* The undo record: `UPDATE products SET is_active = true WHERE sku IN (...)`
           restores exactly the shelf that was there before this ran. */
        deactivated: toDeactivate.map((p) => ({
          sku: p.sku,
          slug: p.slug,
          name: p.name,
          brand: p.brand?.name ?? null,
        })),
      },
      null,
      1,
    )}\n`,
  );
  console.log(`\nreport → ${REPORT}`);

  if (!fix) {
    console.log("\nReport only. Re-run with --fix to deactivate.");
    return;
  }

  const result = await db.product.updateMany({
    where: { sku: { notIn: refs }, isActive: true },
    data: { isActive: false },
  });
  const activeAfter = await db.product.count({ where: { isActive: true } });
  console.log(`\ndeactivated ${result.count} products; ${activeAfter} now active`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
