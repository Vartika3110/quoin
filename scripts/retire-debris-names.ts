/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";

/**
 * Take the rows whose name is catalogue-page debris out of the storefront.
 *
 *   npx tsx scripts/retire-debris-names.ts --dry-run
 *   npx tsx scripts/retire-debris-names.ts
 *   npx tsx scripts/retire-debris-names.ts --restore
 *
 * The PDF importer lifted some cells that were never product names: a
 * bare "Rs" from the price column, a page footer reading "jaquar.com
 * 113", a spec line like "Size: 610x465x275 mm", and — where a table
 * spanned three columns — one row carrying three products' descriptions
 * run together. A shopper can browse to every one of them today.
 *
 * **Nothing here is repaired, because nothing can be.** `description` is
 * empty on all of them and no other column holds the name, so there is
 * no source to reconstruct from; the real fix is a person with the
 * catalogue open, and this only stops customers meeting them meanwhile.
 *
 * **Deactivated, never deleted**, and `--restore` puts them back — the
 * same discipline as `retire-scraped.ts`, for the same reason: rows that
 * are wrong are easier to reason about than rows that are gone. Several
 * of these carry a real price, so this does remove sellable products;
 * a listing whose name is three products bled together cannot be sold
 * meaningfully anyway, and hiding it is the smaller harm.
 *
 * Deliberately narrow. "Tape", "Plate", "Bulb", "MDF" are terse but they
 * are what the thing is, and they are priced — a rule that swallowed
 * those would be removing the catalogue rather than cleaning it.
 */
const db = new PrismaClient();

const RULES: { name: string; test: (n: string) => boolean }[] = [
  { name: "currency marker only", test: (n) => /^(rs\.?|inr|mrp)$/i.test(n.trim()) },
  { name: "bare number or page number", test: (n) => /^[\d,.\s]+$/.test(n.trim()) },
  {
    name: "website or page footer",
    test: (n) => /^(www\.|https?:|jaquar\.com|\S+\.com\b)/i.test(n.trim()),
  },
  {
    name: "spec line, not a name",
    test: (n) => /^(size|material|finish|colour|color|model|code|type)\s*:/i.test(n.trim()),
  },
  {
    name: "dimensions only",
    test: (n) =>
      /^[\d.,\s]+(mm|cm|m|ft|in|")?\s*[x×]\s*[\d.,\s]+/i.test(n.trim()) && !/[a-z]{4,}/i.test(n),
  },
  {
    /* A table that spanned columns put three products in one cell, so the
       same words repeat. Four words minimum, so a legitimate short name
       with one duplicated word is never caught. */
    name: "columns bled together",
    test: (n) => {
      const w = n.trim().split(/\s+/);
      return w.length >= 4 && new Set(w.map((x) => x.toLowerCase())).size <= w.length / 2;
    },
  },
  { name: "one or two characters", test: (n) => n.trim().length <= 2 },
];

function debrisRule(name: string) {
  return RULES.find((r) => r.test(name));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const restore = args.includes("--restore");

  const products = await db.product.findMany({
    where: { isActive: !restore },
    select: {
      id: true,
      sku: true,
      name: true,
      variants: { select: { pricePaise: true } },
    },
  });

  type Match = { p: (typeof products)[number]; rule: string };
  const matched: Match[] = [];
  for (const p of products) {
    const rule = debrisRule(p.name);
    if (rule) matched.push({ p, rule: rule.name });
  }

  const byRule = new Map<string, Match[]>();
  for (const m of matched) {
    const list = byRule.get(m.rule) ?? [];
    list.push(m);
    byRule.set(m.rule, list);
  }

  console.info(
    `${matched.length} ${restore ? "inactive" : "active"} product(s) with a debris name\n`,
  );
  for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.info(`  ${String(list.length).padStart(4)}  ${rule}`);
    for (const { p } of list.slice(0, 2)) {
      const price = (p.variants[0]?.pricePaise ?? 0) / 100;
      console.info(`          [${p.sku}] "${p.name.slice(0, 54)}" ₹${price.toLocaleString("en-IN")}`);
    }
  }

  const priced = matched.filter((m) => (m.p.variants[0]?.pricePaise ?? 0) > 0).length;
  console.info(`\n${priced} of them carry a price; ${matched.length - priced} are ₹0 as well.`);

  if (matched.length === 0) return;
  if (dryRun) {
    console.info(`\ndry run — nothing changed. Drop --dry-run to ${restore ? "restore" : "retire"}.`);
    return;
  }

  const { count } = await db.product.updateMany({
    where: { id: { in: matched.map((m) => m.p.id) } },
    data: { isActive: restore },
  });
  console.info(`\n${restore ? "restored" : "retired"} ${count} product(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
