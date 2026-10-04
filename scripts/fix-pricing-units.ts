/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type PricingUnit } from "@prisma/client";

/**
 * Stop pricing whole bags by the kilo.
 *
 *   npx tsx scripts/fix-pricing-units.ts          # report only
 *   npx tsx scripts/fix-pricing-units.ts --fix    # ...and write
 *
 * Eighty-five products are stored as `PER_KG` or `PER_LITRE` and none of
 * them is sold that way. `PRICING_UNIT_LABEL` is rendered immediately
 * after the price on the product card, the purchase panel, the cart
 * drawer and every Studio hotspot — so a 50 kg bag of cement at ₹350
 * reads "₹350 Per Kg", which overstates it fiftyfold, and a ₹7,745 water
 * heater reads "₹7,745 Per Ltr".
 *
 * Two different mistakes made the same row:
 *
 *   - **A pack size read as a rate.** "Priya PPC Cement, 50 Kg Bag" is
 *     ₹350 for the bag. The importer saw "50 Kg" and set the unit from
 *     it.
 *   - **A rating read as a pack size.** "Hettich KA 5632 Telescopic
 *     Channel, 45 kg Capacity" is a *load* rating, "AO Smith … - 15L" is
 *     a tank volume, "Dongcheng Demolition Hammer 5kg" is what the tool
 *     weighs. None of them is a quantity of anything being sold.
 *
 * In both cases the money in the row is already right — it is the price
 * of one bag, one channel, one heater — and only the label beneath it
 * lies. So this script rewrites `pricingUnit` and touches no price.
 *
 * That is safe to do in isolation because `pricingUnit` is not arithmetic
 * anywhere: checkout, the cart and the order lines never read it. It is a
 * display label and a browse filter, and nothing else. Verified against
 * `src/lib/cart`, `src/lib/orders`, `src/lib/data/orders.ts` and the
 * checkout routes before this script was written.
 *
 * ## Why so few become PER_BAG
 *
 * `PER_BAG` is asserted only where the product's own name contains the
 * word "Bag". The rest become `PER_PIECE`.
 *
 * The temptation is to infer the sack from the category — powder in
 * Tiling & Adhesives is usually bagged — but the exceptions are not rare
 * and they are all in here: "20 Litre Bucket" primers, a 50 kg drum of
 * synthetic resin, acrylic distemper that ships in a tin. "Per Bag"
 * printed on a bucket is a new false statement to replace the old one,
 * and the whole point of this pass is to stop making those.
 *
 * `PER_PIECE` is never wrong for any row here: one bag, one bucket, one
 * channel, one heater is one piece. It is merely less specific than
 * `PER_BAG` would be, and "less specific" is the right way to be wrong
 * when the packaging is not in the data. Anything whose name does say
 * "Bag" gets the better label for free.
 */

const REPORT = path.join("reports", "pricing-unit-fixes.csv");

/** Units that are a rate per quantity, which nothing in this catalogue
    is actually sold at. */
const RATE_UNITS: PricingUnit[] = ["PER_KG", "PER_LITRE"];

/**
 * What this row should have been.
 *
 * Only the product's own name decides, never the category — see the note
 * above on buckets and drums.
 */
export function correctUnit(name: string): PricingUnit {
  /* The row says so itself. */
  if (/\bbags?\b/i.test(name)) return "PER_BAG";

  /* Or it names a dry cementitious product, which in this market is sold
     in a sack and nothing else: cement, plaster, putty, mortar. "Cement
     50kg" does not carry the word "Bag" and is still a bag, and cement is
     the highest-volume line in the catalogue, so leaving it as "Per Pc"
     is vague where the trade is unambiguous.

     The exclusions are the reason this is narrow rather than a category
     rule. A 50 kg drum of synthetic resin adhesive and a 20 litre bucket
     of primer are both in this set, both are powders to a regex, and
     neither is a bag. */
  const dryGoods = /\b(cement|plaster|putty|mortar)\b/i.test(name);
  const notASack = /\b(resin|glue|mastic|liquid|bucket|tin|litre|ltr|\d+\s*L)\b/i.test(name);
  if (dryGoods && !notASack) return "PER_BAG";

  return "PER_PIECE";
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  const write = process.argv.includes("--fix");
  const db = new PrismaClient();

  try {
    const rows = await db.product.findMany({
      where: { pricingUnit: { in: RATE_UNITS } },
      select: {
        id: true,
        sku: true,
        name: true,
        pricingUnit: true,
        isActive: true,
        category: { select: { name: true } },
        variants: {
          select: { pricePaise: true },
          orderBy: { pricePaise: "asc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    const fixes = rows.map((r) => ({ ...r, next: correctUnit(r.name) }));

    await mkdir("reports", { recursive: true });
    const lines = [
      ["sku", "category", "listed", "price", "was", "now", "name"].join(","),
      ...fixes.map((f) =>
        [
          f.sku,
          f.category?.name ?? "",
          f.isActive ? "yes" : "no",
          f.variants[0] ? (f.variants[0].pricePaise / 100).toFixed(2) : "",
          f.pricingUnit,
          f.next,
          f.name,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    await writeFile(REPORT, `${lines.join("\n")}\n`, "utf8");

    for (const f of fixes) {
      const price = f.variants[0]
        ? `₹${(f.variants[0].pricePaise / 100).toFixed(0)}`
        : "—";
      console.log(
        `${f.pricingUnit.padEnd(10)} -> ${f.next.padEnd(10)} ${price.padStart(8)}  ${f.name.slice(0, 62)}`,
      );
    }

    const toBag = fixes.filter((f) => f.next === "PER_BAG").length;
    console.log(`\n[units] ${fixes.length} products priced by weight or volume.`);
    console.log(`[units]   ${toBag}  -> PER_BAG   (says "Bag", or is bagged dry goods)`);
    console.log(`[units]   ${fixes.length - toBag}  -> PER_PIECE`);
    console.log(`[units] -> ${REPORT}`);
    console.log(`[units] No price is changed by this script.`);

    if (!write) {
      console.log("[units] Report only. Re-run with --fix to write.");
      return;
    }

    /* Grouped into two statements rather than one per row: every product
       is going to one of two values, so this is two round trips. */
    let written = 0;
    for (const unit of ["PER_BAG", "PER_PIECE"] as const) {
      const ids = fixes.filter((f) => f.next === unit).map((f) => f.id);
      if (ids.length === 0) continue;
      const { count } = await db.product.updateMany({
        where: { id: { in: ids } },
        data: { pricingUnit: unit },
      });
      written += count;
    }
    console.log(`[units] ${written} pricing units rewritten.`);
  } finally {
    await db.$disconnect();
  }
}

main();
