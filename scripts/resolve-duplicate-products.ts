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
 * The four below were each confirmed against the product photography,
 * not the strings: same pack, same designations on the label, two stock
 * photos of it. They are listed one by one for that reason — the rule
 * that found them was a scan, the decision was a look.
 *
 * The fourth arrived only after the renames at the bottom of this file
 * had run, which is the useful thing to know about scanning for these:
 * a vague name hides its own duplicate. See the note on that entry.
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
  /* Found on a second pass, and only because of the rename below.
     While EB2JT was still called the generic "Araldite Standard Epoxy
     Adhesive" it shared ~30% of its words with this row — under any
     sensible threshold — and the scan could not see the pair at all.
     Naming it for the set it actually is took the overlap to 90%.

     The lesson is in the ordering: a duplicate scan is only as good as
     the names it reads, so the vaguest rows are exactly the ones whose
     twins stay hidden. Renaming first, scanning second. */
  {
    dropSku: "ADHARASTAQ5QQ3",
    keepSku: "EB2JT",
    note: "Araldite Standard set: both photographs are the same twin-bottle pack, AW 106 IN resin and HV 953 IN hardener read off both labels. Rs 939 -> Rs 735. The 28% gap is wider than the others here and neither label prints a net quantity, so this is a deactivation on the strength of the labels matching, not a certainty.",
  },
  /* Found by `audit-duplicate-products.ts` once it matched on the
     manufacturer's model code rather than on words. Each was then
     confirmed against the photography like the rest. */
  {
    dropSku: "WATDRFCRAUDRLO",
    keepSku: "G44YV",
    note: "Dr. Fixit 201 Crack-X Paste: both photographs are the same 500 g tub, net quantity printed on each. Rs 244 -> Rs 217.",
  },
  {
    dropSku: "SEAFEVNAIWYNF6",
    keepSku: "EEUDY",
    note: "Fevicol Nail Free Ultra: the same cartridge in two packaging revisions. Rs 380 -> Rs 364.",
  },
  /* The one Roff pair confirmed by photograph. Its scrape-side label
     reads "EXTROFIX / T07 / Grey", which is exactly what the kept row's
     name spells out and what the dropped row's name left off.

     Here the kept row is the dearer of the two, which breaks the rule
     the pairs above follow. It is the right way round: Rs 38 is a 4%
     difference, while a tile adhesive listed without its colour or its
     bag weight cannot be bought with any confidence at all. The price
     is worth a second look by someone who knows what Quoin pays — see
     the note in the summary — but the unusable listing is not the one
     to keep.

     Its five siblings (T03, T04, T06, T20, and the MYK Laticrete 305
     through 335 family) match on code with gaps of 1-34% and are NOT
     here: they are in `reports/duplicate-products.csv` awaiting the
     same look at the photographs. */
  {
    dropSku: "TILROFROFJ7ITL",
    keepSku: "TT796",
    note: "Roff T07 Extrofix: the dropped row's bag is labelled Grey, matching the kept row. Rs 982 -> Rs 1020, and the kept row is the one that states colour and 20 Kg bag.",
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
  /* Birla White, and the reason this kind of name has to be fixed
     rather than tolerated.

     These two rows reported as a perfect duplicate — a score of 1.00,
     no word telling them apart — and they are nothing of the sort: one
     is a 1 kg pouch at Rs 41 and the other a 50 kg sack at Rs 1200,
     both weights printed plainly on the bags. Neither name said so, and
     the brand being "Birla White" meant that stripping the brand from
     "White cement" left only "cement".

     A name that omits the one thing distinguishing it from its
     neighbour is not merely unhelpful on the page; it manufactures
     false positives in every scan run against it. Both weights come
     off the photographs, so nothing here is inferred from price. */
  {
    sku: "ADHBIRWHI8T2QR",
    from: "White cement",
    to: "Birla White Portland Cement, 1 kg",
    note: "Rs 41 — NET QUANTITY 1kg on the pouch.",
  },
  {
    sku: "UVJQ9",
    from: "Birla White Cement",
    to: "Birla White Portland Cement, 50 kg",
    note: "Rs 1200 — NET QUANTITY 50kg on the sack.",
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
