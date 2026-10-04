/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Take the unbuyable products off the shelf.
 *
 *   npx tsx scripts/retire-unbuyable.ts          # report only
 *   npx tsx scripts/retire-unbuyable.ts --fix    # ...and deactivate
 *
 * Six hundred and four active products have no `ProductVariant` at all.
 * A product without a variant has no price and nothing to put in a cart,
 * so every one of them is a listing that cannot be bought — and they are
 * not hidden away: they appear in category pages, in search results and
 * in "related items", and the only way a customer finds out is by
 * arriving on the page.
 *
 * All six hundred and four are Jaquar. That is the shape of the problem:
 * not damage scattered across the catalogue, but one import that read a
 * 707-page bath catalogue and took rows off the page that were never
 * products.
 *
 * ## Two kinds, and why they are reported apart
 *
 * **Debris** is a row that is not a product and never was — a page
 * footer (`114 jaquar.com`), a size table (`H: 1950 W: 2001 - 2400 Rs`),
 * a specification block, a stray `Rs. Recommended for: Kitchen`. Nobody
 * will ever price these, because there is nothing to price. They want
 * deactivating and forgetting.
 *
 * **Needs a price** is a real Jaquar product — a wall mixer, a steam
 * generator, a concealed stop cock — whose price column did not survive
 * the import. These are worth selling and will come back the moment
 * somebody puts a number against them.
 *
 * Both are deactivated, because the customer-facing consequence is
 * identical and immediate. They are reported apart because the work
 * each needs is not: one is a discard nobody has to think about, the
 * other is a pricing job with a few hundred lines in it.
 *
 * ## Deactivate, never delete
 *
 * `isActive = false` and nothing else. These rows carry `sourceUrl` and
 * `sourceName` provenance, some carry images somebody paid to generate,
 * and a deleted row takes its SKU with it — so a later import creates a
 * second product at the same SKU rather than mending the first. Setting
 * a flag is also the only version of this that is reversible by somebody
 * who disagrees with a judgement call below.
 *
 * Idempotent: a second run finds nothing left to do, because the rows it
 * acted on are no longer active.
 */

const REPORT = path.join("reports", "unbuyable-products.csv");

/**
 * Whether a name is PDF wreckage rather than a product.
 *
 * Deliberately conservative — every test here fires on something no
 * product name contains. A row this does not catch is reported as
 * needing a price, which costs somebody a glance at a list; a row it
 * catches wrongly would retire something sellable, which costs a sale.
 * When in doubt the answer is "needs a price".
 */
export function isDebris(name: string): boolean {
  /* The catalogue's own page footer — "184 jaquar.com" — scanned off the
     bottom of the page and glued to whatever name was above it. Stripped
     before anything else is judged, because a real product that merely
     collected a footer is still a real product: `Steam Generator Without
     Digital Control Panel- 24 kW ... 184 jaquar.com` belongs on the
     pricing list, not the discard pile. What is left over once the
     footer goes is what the tests below actually read. */
  const s = name.replace(/\s*\d*\s*jaquar\.com\s*/gi, " ").trim();

  /* Nothing but the footer: the row was the page number and no more. */
  if (s.length === 0) return true;

  /* A size-table row: "H: 1950 W: 2001 - 2400 Rs". The enclosure's
     dimensions, not a thing with a name. */
  if (/^(entry\s+)?H:\s*\d+\s*W:/i.test(s)) return true;

  /* A fragment that begins where the real sentence ended — the price
     column or a spec label bled into the name field. */
  if (/^(Rs\.?\s|Recommended for|Available in|Note:|Description:)/i.test(s)) {
    return true;
  }

  /* A specification block rather than a title. */
  if (/Product Specifications|Raw Material:|Rated Wattage|Working Pressure/i.test(s)) {
    return true;
  }

  /* Barely any words in it at all: a code, a measurement, a page number.
     Twelve letters is about three short words, and no real product in
     this catalogue is named in fewer. */
  if ((s.match(/[A-Za-z]/g) ?? []).length < 12) return true;

  /* A bulleted marketing block — the brand's warranty and finish copy,
     scanned off a feature page and stored as a title. The bullet is the
     giveaway: no product in this catalogue has one in its name. */
  if (s.includes("•")) return true;

  /* Prose rather than a name. Some genuine Jaquar titles in here run to
     two hundred characters because they list the kit contents, so the
     bound is set well past those: at four hundred it is catching the
     page of brand copy, not a long product. */
  if (s.length > 400) return true;

  return false;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  const write = process.argv.includes("--fix");
  const db = new PrismaClient();

  try {
    /* Every variant-less product, live or already retired — not just the
       active ones.

       The report is the pricing worklist, and scoping it to `isActive`
       would empty it the moment this script succeeded: the second run
       would overwrite four hundred lines of real work-to-do with a file
       saying zero. What is retired is a separate question, asked below
       against this same set. */
    const rows = await db.product.findMany({
      where: { variants: { none: {} } },
      select: {
        id: true,
        sku: true,
        name: true,
        isActive: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { sku: "asc" },
    });

    const debris = rows.filter((r) => isDebris(r.name));
    const needsPrice = rows.filter((r) => !isDebris(r.name));
    const live = rows.filter((r) => r.isActive);

    await mkdir("reports", { recursive: true });
    const lines = [
      ["verdict", "sku", "brand", "category", "listed", "name"].join(","),
      ...rows.map((r) =>
        [
          isDebris(r.name) ? "debris" : "needs-price",
          r.sku,
          r.brand?.name ?? "",
          r.category?.name ?? "",
          r.isActive ? "yes" : "no",
          r.name,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    await writeFile(REPORT, `${lines.join("\n")}\n`, "utf8");

    console.log(`[unbuyable] ${rows.length} products have no variant.`);
    console.log(`[unbuyable]   ${debris.length}  debris — not products at all`);
    console.log(`[unbuyable]   ${needsPrice.length}  real products with no price`);
    console.log(`[unbuyable]   ${live.length}  still listed to customers`);
    console.log(`[unbuyable] -> ${REPORT}`);

    if (!write) {
      console.log("[unbuyable] Report only. Re-run with --fix to deactivate.");
      return;
    }

    /* One statement for the lot. These are independent flag flips with no
       ordering between them, and `updateMany` is a single round trip
       rather than six hundred. */
    const { count } = await db.product.updateMany({
      where: { id: { in: live.map((r) => r.id) } },
      data: { isActive: false },
    });

    console.log(`[unbuyable] ${count} products deactivated.`);
    console.log(
      `[unbuyable] Nothing deleted — set isActive back to true once a ` +
        `variant and a price exist. The ${needsPrice.length} in the ` +
        `"needs-price" column are worth that work.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main();
