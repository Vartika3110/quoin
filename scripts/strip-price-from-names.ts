/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";

/**
 * Take the price back out of the product name.
 *
 *   npx tsx scripts/strip-price-from-names.ts          # report only
 *   npx tsx scripts/strip-price-from-names.ts --fix    # ...and write
 *
 * The catalogue was imported out of manufacturer PDFs by reading rows off
 * a printed price table. Where a row wrapped, or where the price column
 * sat flush against the description, the rupee figure came across as part
 * of the name — so the storefront offers "3,400 Artificial Marble Ledge
 * 801-1200" and "Built-in Bathtub 36,000 4,150".
 *
 * `scripts/audit-catalogue.ts` finds these (kind `price-in-name`) but
 * proposes no repair for them: its fixer handles damage at the *edges* of
 * a name and declines anything it cannot rewrite with certainty, which is
 * the right default for a script that edits what customers read.
 *
 * This one takes the narrower job and does it with certainty. It removes
 * a price token only when it sits at the very start or the very end of
 * the name and the remainder still reads as a product — never from the
 * middle, where "1200 x 1200" and "1,13,000" are the same shape to a
 * regex and only one of them is a price.
 *
 * What it deliberately does not touch:
 *
 *   - Rows that are price-table debris rather than products at all
 *     ("363SPPZ, 751P180SPPZ, ... 1,450 1,225"). There is no name to
 *     recover; they want deactivating, which is a different decision and
 *     a different script.
 *   - Rows where a figure is embedded mid-name. A human has to read those.
 *
 * Indian digit grouping is the reason for the pattern below: ₹1,13,000 is
 * lakh-grouped, not thousand-grouped, so `\d{1,3}(,\d{3})*` misses it.
 */

/** A rupee figure as these catalogues print it: 3,400 · 36,000 · 1,13,000 */
const PRICE = String.raw`\d{1,3}(?:,\d{2,3})+(?:\.\d+)?`;

/** One or more prices at the head, optionally behind a stray "Rs." */
const LEADING = new RegExp(String.raw`^(?:Rs\.?\s*)?(?:${PRICE}\s+)+(.*)$`);

/** One or more prices at the tail, with whatever punctuation trails them. */
const TRAILING = new RegExp(String.raw`^(.*?)\s+(?:${PRICE}[\s,]*)+$`);

/** Below this, what is left is not a name — it is a fragment. */
const MIN_REMAINDER = 9;

export function stripPrice(name: string): string | null {
  const n = name.trim();

  for (const pattern of [LEADING, TRAILING]) {
    const m = n.match(pattern);
    if (!m) continue;
    const rest = m[1].trim();
    /* The remainder has to be a name on its own: long enough to be one,
       and free of any further price — a second figure means the damage is
       not confined to the edge and this script is the wrong tool. */
    if (rest.length < MIN_REMAINDER) continue;
    if (new RegExp(PRICE).test(rest)) continue;
    if (rest === n) continue;
    return rest;
  }
  return null;
}

async function main() {
  const write = process.argv.includes("--fix");
  const db = new PrismaClient();

  try {
    const products = await db.product.findMany({
      select: { id: true, sku: true, name: true },
    });

    const repairs = products
      .map((p) => ({ ...p, next: stripPrice(p.name) }))
      .filter((p): p is typeof p & { next: string } => p.next !== null);

    for (const r of repairs) {
      console.log(`${r.sku}\n  - ${r.name}\n  + ${r.next}`);
    }

    console.log(
      `\n[names] ${repairs.length} of ${products.length} products carry a price at the edge of the name.`,
    );

    if (!write) {
      console.log("[names] Report only. Re-run with --fix to write.");
      return;
    }

    /* One statement each rather than a transaction: these are independent
       single-row edits, and a failure partway through leaves the rest
       correctly repaired rather than rolling back good work. */
    let written = 0;
    for (const r of repairs) {
      await db.product.update({ where: { id: r.id }, data: { name: r.next } });
      written += 1;
    }
    console.log(`[names] ${written} names rewritten.`);
  } finally {
    await db.$disconnect();
  }
}

main();
