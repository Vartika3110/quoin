/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

/**
 * Two products that are one product, and one product that reads as two.
 *
 *   npx tsx scripts/resolve-duplicate-products.ts          # dry run
 *   npx tsx scripts/resolve-duplicate-products.ts --apply
 *   npx tsx scripts/resolve-duplicate-products.ts --restore <backup.json>
 *
 * The live catalogue was built from two imports — a supplier-PDF pass
 * and a scrape of ypanda.in — and the owner's master list is the union
 * of both, so it carries the overlap rather than resolving it. Of 518
 * live products, 230 came from the scrape and 288 from the other source;
 * where both described the same goods, the shelf shows it twice at two
 * prices.
 *
 * ## Which rows are actually duplicates
 *
 * Name matching alone does not answer this and must not be trusted to.
 * Two Araldite rows share a name *exactly* and are not duplicates at all
 * — one is the twin-tube carton at Rs 223, the other the AW 106 + HV 953
 * bottle set at Rs 735, which is why their prices differ by 3.3x. An
 * automated merge on name would have deleted a real product.
 *
 * The three below were each confirmed against the product photography,
 * not the strings: same pack, same net quantity on the label, two stock
 * photos of it. They are listed one by one for that reason — the rule
 * that found them was a scan, the decision was a look.
 *
 * ## Deactivate, never delete
 *
 * The same call `restrict-to-master-list.ts` made, for the same reasons:
 * it is reversible, and it keeps the `source*` provenance that records
 * what each import produced. That script only ever deactivates rows
 * *absent* from the master list, so a re-run will not switch these back
 * on — they join the nine master-list products already off the shelf for
 * reasons that still hold.
 *
 * Order history is unaffected: `OrderLine` snapshots sku, title and
 * price at the moment of sale and has no foreign key to `Product`.
 *
 * ## Slugs are left alone
 *
 * A renamed product keeps its slug, which is what `clean-product-names.ts`
 * does. The slug is a live URL and the name is what a customer reads;
 * rebuilding the first to match the second trades a working link for a
 * string nobody sees.
 */
const db = new PrismaClient();

interface Duplicate {
  /** The row to take off the shelf. */
  dropSku: string;
  /** The row that stays, and why it is the one to keep. */
  keepSku: string;
  note: string;
}

/**
 * Same goods listed twice, confirmed against the photography.
 *
 * In all three the kept row is both the cheaper and the one from the
 * supplier-PDF import; the dropped row is the scrape's copy. Quoting a
 * customer Rs 623 for a bucket the catalogue also holds at Rs 610 is the
 * concrete harm here, so where two rows are the same pack the cheaper
 * one is the honest listing.
 */
const DUPLICATES: Duplicate[] = [
  {
    dropSku: "TILMYKMYKZS1Y2",
    keepSku: "T75CL",
    note: "SP-100 resin kit: both photos are the same 250 g bucket. Rs 623 -> Rs 610.",
  },
  {
    dropSku: "TILMYKMYKPGJ5L",
    keepSku: "7Q8UJ",
    note: "SP-100 Part C: the names differ only in Color/Colour. Rs 192 -> Rs 130.",
  },
  {
    dropSku: "TILFEVFEVTY8ZK",
    keepSku: "E59GG",
    note: "Fevicol Marine: same woodworking adhesive, Rs 370 -> Rs 364. Neither label states a net quantity, so this is the least certain of the three — and the reason this is a deactivation rather than a delete.",
  },
];

/**
 * One name covering two different packs.
 *
 * Neither the master list nor either import records a pack weight for
 * these, and the photographs do not print one, so no gram figure is
 * invented here: each row is named for the form that is visible on the
 * packaging. The bottle set takes the designation the master list itself
 * uses for the same configuration elsewhere ("Standard Epoxy Adhesive
 * Set AW 106 + HV 953 IN", ref ADHARASTAQ5QQ3).
 *
 * If a supplier sheet later gives the weights, these are the two rows to
 * put them on.
 */
const RENAMES: { sku: string; from: string; to: string; note: string }[] = [
  {
    sku: "ADHARAARAJDE82",
    from: "Araldite Standard Epoxy Adhesive",
    to: "Araldite Standard Epoxy Adhesive, Tube Pack",
    note: "Rs 223 — carton of two tubes in the photograph.",
  },
  {
    sku: "EB2JT",
    from: "Araldite Standard Epoxy Adhesive",
    to: "Araldite Standard Epoxy Adhesive Set, AW 106 + HV 953 IN",
    note: "Rs 735 — resin and hardener bottles, designations read off the labels.",
  },
];

interface Backup {
  deactivated: { id: string; sku: string; isActive: boolean }[];
  renamed: { id: string; sku: string; name: string }[];
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const restoreAt = args.indexOf("--restore");

  if (restoreAt !== -1) return restore(args[restoreAt + 1]);

  const backup: Backup = { deactivated: [], renamed: [] };

  console.info("DEACTIVATE — duplicate listings\n");
  for (const dupe of DUPLICATES) {
    const drop = await db.product.findUnique({
      where: { sku: dupe.dropSku },
      select: { id: true, name: true, isActive: true },
    });
    const keep = await db.product.findUnique({
      where: { sku: dupe.keepSku },
      select: { sku: true, name: true, isActive: true },
    });

    if (!drop) {
      console.info(`  SKIP  ${dupe.dropSku} — no such product\n`);
      continue;
    }
    if (!drop.isActive) {
      console.info(`  SKIP  ${dupe.dropSku} — already off the shelf\n`);
      continue;
    }
    /* Never take the only copy down. If the keeper has gone inactive
       since this list was written, deactivating the duplicate removes
       the product from the shelf entirely, which is not what any of
       this is for. */
    if (!keep?.isActive) {
      console.info(
        `  SKIP  ${dupe.dropSku} — keeper ${dupe.keepSku} is not live; ` +
          `taking this down would remove the product altogether\n`,
      );
      continue;
    }

    console.info(`  ${dupe.dropSku}  ${drop.name}`);
    console.info(`     -> keeping ${keep.sku}  ${keep.name}`);
    console.info(`     ${dupe.note}\n`);

    if (!apply) continue;
    backup.deactivated.push({ id: drop.id, sku: dupe.dropSku, isActive: drop.isActive });
    await db.product.update({ where: { id: drop.id }, data: { isActive: false } });
  }

  console.info("RENAME — one name, two different packs\n");
  for (const rename of RENAMES) {
    const row = await db.product.findUnique({
      where: { sku: rename.sku },
      select: { id: true, name: true },
    });

    if (!row) {
      console.info(`  SKIP  ${rename.sku} — no such product\n`);
      continue;
    }
    if (row.name === rename.to) {
      console.info(`  SKIP  ${rename.sku} — already renamed\n`);
      continue;
    }
    /* The expected name is asserted rather than assumed: if something
       else has edited this row since, the new name may no longer be the
       right description and a blind overwrite would lose that edit. */
    if (row.name !== rename.from) {
      console.info(
        `  SKIP  ${rename.sku} — expected ${JSON.stringify(rename.from)}, ` +
          `found ${JSON.stringify(row.name)}\n`,
      );
      continue;
    }

    console.info(`  ${rename.sku}  ${JSON.stringify(row.name)}`);
    console.info(`     -> ${JSON.stringify(rename.to)}`);
    console.info(`     ${rename.note}  (slug unchanged)\n`);

    if (!apply) continue;
    backup.renamed.push({ id: row.id, sku: rename.sku, name: row.name });
    await db.product.update({ where: { id: row.id }, data: { name: rename.to } });
  }

  if (!apply) {
    console.info("Dry run. Re-run with --apply to write these changes.");
    return;
  }

  mkdirSync(path.join(process.cwd(), ".backups"), { recursive: true });
  const backupPath = path.join(
    process.cwd(),
    ".backups",
    `resolve-duplicate-products-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.info(
    `Applied: ${backup.deactivated.length} deactivated, ${backup.renamed.length} renamed.\n` +
      `Backup written to ${backupPath}`,
  );
}

async function restore(file: string | undefined) {
  if (!file) throw new Error("usage: --restore <backup.json>");
  const backup: Backup = JSON.parse(readFileSync(file, "utf8"));

  for (const row of backup.deactivated) {
    await db.product.update({ where: { id: row.id }, data: { isActive: row.isActive } });
  }
  for (const row of backup.renamed) {
    await db.product.update({ where: { id: row.id }, data: { name: row.name } });
  }

  console.info(
    `Restored ${backup.deactivated.length} listing(s) and ${backup.renamed.length} name(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
