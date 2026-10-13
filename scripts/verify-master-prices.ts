/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Check every price in the catalogue against the owner's price list.
 *
 *   npx tsx scripts/verify-master-prices.ts
 *
 * Read-only. There is no `--fix`, deliberately: this reports a
 * disagreement between the owner's list and the shop, and which of the
 * two is wrong is not a thing a script can know.
 *
 * ## What "the price" means here
 *
 * A card does not render `pricePaise`. It renders `resolvePrice`
 * (src/lib/types/catalog.ts), which picks the cheapest variant, swaps in
 * the Pro rate for a Pro customer, and shows `mrpPaise` struck through
 * whenever it is higher. So four stored numbers can each make the shop
 * disagree with the list, and all four are checked:
 *
 *  - **`pricePaise`** — what a standard customer pays. Must equal the
 *    list price exactly.
 *  - **`mrpPaise`** — struck through when above the price, which is a
 *    claim that the customer is saving money. The list carries one
 *    number per product and so backs no such claim.
 *  - **`proPricePaise`** — what a Pro pays. Below the list price is a
 *    trade rate and a decision; *above* it would mean a Pro paying more
 *    for being a Pro.
 *  - **`PriceTier`** — volume pricing, which replaces the price outright
 *    at a quantity. A tier is invisible until the basket reaches it.
 *
 * GST is not a fifth number. Every price in this app is tax-inclusive
 * and the tax is extracted from it (`taxForLine`), so a ₹1,400 valve is
 * ₹1,400 at checkout, with ₹213.56 of it reported as GST rather than
 * added to it. A price that matched the list and then grew by 18% at the
 * till would be the worst failure here, so the arithmetic is shown for
 * the dearest row rather than asserted.
 */
const db = new PrismaClient();

const LIST = path.join("scripts", "data", "master-catalogue.json");
const PRICES = path.join("scripts", "data", "master-catalogue-prices.json");
const REPORT = path.join("reports", "price-verification.json");

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

async function main() {
  const listed: { ref: string; pricePaise: number; name: string; brand: string }[] = JSON.parse(
    await readFile(PRICES, "utf8"),
  ).products;
  const names = new Map(
    (JSON.parse(await readFile(LIST, "utf8")).products as { ref: string; name: string }[]).map(
      (p) => [p.ref, p.name],
    ),
  );

  const products = await db.product.findMany({
    where: { sku: { in: listed.map((l) => l.ref) } },
    select: {
      sku: true,
      name: true,
      isActive: true,
      gstRatePct: true,
      variants: {
        select: {
          sku: true,
          label: true,
          isDefault: true,
          isActive: true,
          pricePaise: true,
          mrpPaise: true,
          proPricePaise: true,
          priceTiers: { select: { minQty: true, pricePaise: true } },
        },
      },
    },
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const missing: string[] = [];
  const priceMismatch: string[] = [];
  const multiVariant: string[] = [];
  const strikethrough: string[] = [];
  const proAbove: string[] = [];
  const tiers: string[] = [];

  for (const row of listed) {
    const product = bySku.get(row.ref);
    if (!product) {
      missing.push(`${row.ref}  ${row.brand} ${row.name}`);
      continue;
    }

    /* The card prices the cheapest variant, so a second variant changes
       what is displayed even when the default matches the list. */
    if (product.variants.length > 1) {
      multiVariant.push(`${row.ref}  ${product.variants.length} variants`);
    }

    const cheapest = product.variants.reduce(
      (min, v) => (v.pricePaise < min.pricePaise ? v : min),
      product.variants[0],
    );
    if (!cheapest) {
      priceMismatch.push(`${row.ref}  no variant at all — nothing to price`);
      continue;
    }

    if (cheapest.pricePaise !== row.pricePaise) {
      priceMismatch.push(
        `${row.ref.padEnd(16)} list ${rupees(row.pricePaise).padStart(12)}   shop ${rupees(cheapest.pricePaise).padStart(12)}   ${names.get(row.ref) ?? ""}`,
      );
    }

    for (const v of product.variants) {
      if (v.mrpPaise > v.pricePaise) {
        strikethrough.push(
          `${row.ref.padEnd(16)} shows ${rupees(v.mrpPaise)} struck through against ${rupees(v.pricePaise)}`,
        );
      }
      if (v.proPricePaise != null && v.proPricePaise > v.pricePaise) {
        proAbove.push(`${row.ref.padEnd(16)} Pro ${rupees(v.proPricePaise)} > standard ${rupees(v.pricePaise)}`);
      }
      for (const t of v.priceTiers) {
        tiers.push(`${row.ref.padEnd(16)} from ${t.minQty} units: ${rupees(t.pricePaise)}`);
      }
    }
  }

  const checked = listed.length - missing.length;
  console.log(`price list                 ${listed.length} references`);
  console.log(`  checked against the shop ${checked}`);
  console.log(`  not in the catalogue     ${missing.length}`);
  console.log(`\nprices disagreeing with the list   ${priceMismatch.length}`);
  for (const line of priceMismatch) console.log(`   ${line}`);
  console.log(`products with more than one variant ${multiVariant.length}`);
  for (const line of multiVariant) console.log(`   ${line}`);
  console.log(`cards claiming a saving             ${strikethrough.length}`);
  for (const line of strikethrough.slice(0, 20)) console.log(`   ${line}`);
  console.log(`Pro rates above the standard price  ${proAbove.length}`);
  for (const line of proAbove) console.log(`   ${line}`);
  console.log(`volume tiers that replace a price   ${tiers.length}`);
  for (const line of tiers.slice(0, 20)) console.log(`   ${line}`);

  /* GST, shown rather than asserted: the dearest row on the list, with
     the tax backed out of the price the customer pays. */
  const dearest = listed.reduce((max, l) => (l.pricePaise > max.pricePaise ? l : max), listed[0]);
  const product = bySku.get(dearest.ref);
  if (product) {
    const rate = product.gstRatePct;
    const tax = Math.round((dearest.pricePaise * rate) / (100 + rate));
    console.log(
      `\nGST check — ${dearest.ref}, the dearest on the list:\n` +
        `   list price      ${rupees(dearest.pricePaise)}\n` +
        `   customer pays   ${rupees(dearest.pricePaise)}   (not ${rupees(Math.round(dearest.pricePaise * (1 + rate / 100)))}, which is what adding ${rate}% on top would charge)\n` +
        `   of which GST    ${rupees(tax)} at ${rate}%, extracted from the price`,
    );
  }

  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(
    REPORT,
    `${JSON.stringify(
      { ranAt: new Date().toISOString(), checked, missing, priceMismatch, multiVariant, strikethrough, proAbove, tiers },
      null,
      1,
    )}\n`,
  );
  console.log(`\nreport → ${REPORT}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
