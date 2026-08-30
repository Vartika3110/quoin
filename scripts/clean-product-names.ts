/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

/**
 * Repair product names taken out of catalogue PDFs.
 *
 *   npx tsx scripts/clean-product-names.ts --dry-run
 *   npx tsx scripts/clean-product-names.ts
 *
 * Two catalogues, two failure modes. Ozone prints its names as headings
 * in capitals above a table, so they arrive shouting and sometimes with
 * the heading's two halves run together. Jaquar prints them in cells that
 * wrap across columns, so a few arrive as a specification line — "Size:
 * 210x310x685 mm" — which is not a name at all.
 *
 * Three sources are used, best first:
 *
 *  1. The retailer listing for the same product, where one exists and
 *     matches unambiguously. Those names were written by a person for
 *     shoppers, which is better than anything liftable from a PDF.
 *  2. The range the catalogue prints as a page heading — Laguna, Aria,
 *     Florentine Prime — which is how Jaquar itself distinguishes an
 *     otherwise identically-described fitting.
 *  3. The model code, for what still collides after those.
 *
 * What this cannot do is invent a name for a product whose cell never
 * held one. Those are reported rather than guessed at.
 */
const db = new PrismaClient();

/** Words that stay upper-case when a shouted name is set in title case. */
const KEEP_UPPER = new Set([
  "LED", "PVC", "CPVC", "UPVC", "SS", "MS", "MDF", "HDF", "WC", "EWC",
  "ABS", "PU", "UV", "IP", "DC", "AC", "USB", "RFID", "3D", "2D", "L", "R",
  "MM", "KG", "W", "V", "AB", "NP", "CP", "GL", "XL", "MP", "HD", "TV",
]);

const SMALL_WORDS = new Set(["and", "with", "for", "of", "the", "in", "on", "to", "by", "a", "an"]);

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      const bare = word.replace(/[^a-z0-9]/gi, "");
      if (KEEP_UPPER.has(bare.toUpperCase())) return word.toUpperCase();
      /* A token carrying digits is a size or a model — leave it alone. */
      if (/\d/.test(word)) return word.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(bare)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** "MP Lock Latch MP Lock" -> "MP Lock Latch". */
function dropRepeatedTail(value: string): string {
  const words = value.split(/\s+/);
  for (let size = Math.floor(words.length / 2); size >= 2; size--) {
    const tail = words.slice(-size).join(" ").toLowerCase();
    const before = words.slice(0, -size).join(" ").toLowerCase();
    if (before.endsWith(tail)) return words.slice(0, -size).join(" ");
  }
  return value;
}

/**
 * A manufacturer's code, and not an ordinary hyphenated word.
 *
 * Every real code in these catalogues carries a digit — ORP-CHR-10021PM,
 * OZ-WB-AH-3D, OEC35-F2S. Matching on shape alone deleted POP-UP,
 * BI-FOLD and T-BLACK out of the middle of product names.
 */
const PRODUCT_CODE = /\b[A-Z]{2,5}(?:-[A-Z0-9]+){1,}\b/g;

function isProductCode(token: string): boolean {
  return /\d/.test(token) && token.replace(/[^A-Z0-9]/g, "").length >= 5;
}
const SPEC_ONLY = /^(size|dimension|weight|finish|material|note)\b/i;
const DIMENSION_RUN = /^[\d\s.,x×X*mM()-]+$/;
/** "H: 2000 W: 801 - 1200" — a size where a name should be. */
const DIMENSION_ISH = /^[HWDL]\s*[:x]/i;

interface Result {
  name: string;
  unusable: boolean;
}

function clean(raw: string): Result {
  let name = raw.replace(/\s+/g, " ").trim();

  /* Catalogue furniture that rode along with the text. */
  name = name.replace(/\b(?:jaquar\.com|www\.[a-z.]+)\b/gi, "");

  /* Prices from the neighbouring column: a comma-grouped number standing
     on its own is a rupee amount, never part of a fitting's name. A size
     keeps its commas attached to a unit — "1900 x 900" has none — so this
     does not touch dimensions. */
  name = name.replace(/(^|\s)\d{1,3},\d{3}(?=\s|$)/g, " ");
  name = name.replace(/\s*\*+\s*/g, " ");
  name = name.replace(PRODUCT_CODE, (m) => (isProductCode(m) ? "" : m));
  name = name.replace(/\s*[|·•]\s*$/g, "");
  name = name.replace(/\s{2,}/g, " ").replace(/\s+([,.)])/g, "$1").trim();
  name = name.replace(/^[\s,.\-–—|]+|[\s,.\-–—|]+$/g, "");

  if (/^[A-Z0-9\s&/,.'()+-]+$/.test(name) && /[A-Z]{3}/.test(name)) {
    name = titleCase(name);
  }
  name = dropRepeatedTail(name);

  const unusable =
    name.length < 5 || SPEC_ONLY.test(name) || DIMENSION_RUN.test(name) || DIMENSION_ISH.test(name);
  return { name, unusable };
}

const tokens2 = (s: string) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));

function similarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Adopt a retailer's name only where exactly one catalogue product claims
 * it and it claims exactly that product.
 *
 * Without the second half, five fittings that differ by the word
 * "extended", "regular" or "pipe" all take the same listing's name and
 * four of them end up wrong — which measured at 0.75 and up, well inside
 * anything a threshold alone would accept.
 */
const ADOPT_SCORE = 0.75;

async function retailerNames(): Promise<Map<string, string>> {
  const scraped = await db.product.findMany({
    where: { sourceName: { in: ["handypanda", "homerun"] } },
    select: { name: true, brandId: true },
  });
  const catalogue = await db.product.findMany({
    where: { sourceName: { contains: "catalogue" } },
    select: { id: true, name: true, brandId: true },
  });

  const pool = new Map<string, { name: string; t: Set<string> }[]>();
  for (const s of scraped) {
    const key = s.brandId ?? "-";
    pool.set(key, [...(pool.get(key) ?? []), { name: s.name, t: tokens2(s.name) }]);
  }

  /* Every claim first, then keep only the pairs that are each other's
     single best match. */
  const claims = new Map<string, { id: string; score: number }[]>();
  for (const c of catalogue) {
    const options = pool.get(c.brandId ?? "-") ?? [];
    const ct = tokens2(c.name);
    let best = { name: "", score: 0 };
    for (const o of options) {
      const score = similarity(ct, o.t);
      if (score > best.score) best = { name: o.name, score };
    }
    if (best.score >= ADOPT_SCORE) {
      claims.set(best.name, [...(claims.get(best.name) ?? []), { id: c.id, score: best.score }]);
    }
  }

  const adopted = new Map<string, string>();
  for (const [name, wanting] of claims) {
    if (wanting.length === 1) adopted.set(wanting[0].id, name);
  }
  return adopted;
}

/** Page number -> a heading from that page. `file` picks range or section. */
function headingByPage(file_: string): Map<number, string> {
  const out = new Map<number, string>();
  try {
    const file = path.join("research", "data", "catalogues", "jaquar", file_);
    for (const [page, name] of Object.entries(JSON.parse(readFileSync(file, "utf8")) as Record<string, string>)) {
      out.set(Number(page), name);
    }
  } catch {
    /* No ranges extracted for this catalogue; names keep their own words. */
  }
  return out;
}

/**
 * Put the maker's name in front of a listing that lacks it.
 *
 * The retailer listings are terse — "Geyser", "MCB TPN", "Tee PVC" — and
 * four different manufacturers' products arrive under one of those with
 * nothing on the card to separate them. The brand is already on the row;
 * it just was not in the words.
 *
 * "Generic" is skipped: it is what the importer files a product under
 * when the source named no maker, so putting it in front of a name states
 * something the data does not know.
 */
async function nameScrapedByBrand(dryRun: boolean): Promise<void> {
  const rows = await db.product.findMany({
    where: { sourceName: { in: ["handypanda", "homerun"] } },
    select: { id: true, name: true, brand: { select: { name: true } } },
  });

  let prefixed = 0;
  for (const row of rows) {
    const brand = row.brand?.name;
    if (!brand || brand.toLowerCase() === "generic") continue;

    /* Match on the distinctive first word so "Asian Paints Royale" is not
       re-prefixed with "Asian Paints", and neither is a name that already
       opens with the maker under a different spelling. */
    const head = brand.split(/\s+/)[0].toLowerCase();
    if (row.name.toLowerCase().includes(head)) continue;

    const name = `${brand} ${row.name}`.replace(/\s+/g, " ").trim();
    prefixed++;
    if (!dryRun) await db.product.update({ where: { id: row.id }, data: { name } });
  }

  console.info(`${prefixed} retailer listing(s) ${dryRun ? "would take" : "took"} their maker's name in front`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const products = await db.product.findMany({
    where: { sourceName: { contains: "catalogue" } },
    select: { id: true, sku: true, name: true },
  });

  await nameScrapedByBrand(dryRun);

  /* Rebuild from what the PDF actually said, not from whatever a previous
     run left in the column. Reading the current name back in means a
     second run prefixes the range twice — "Alpha Alpha Shower Enclosure". */
  const original = new Map<string, string>();
  for (const dir of ["jaquar", "ozone"]) {
    try {
      const file = path.join("research", "data", "catalogues", dir, `${dir}-catalogue.json`);
      const manifest = JSON.parse(readFileSync(file, "utf8")) as {
        products: { code: string; description: string | null }[];
      };
      for (const row of manifest.products) {
        if (row.description && !original.has(row.code)) original.set(row.code, row.description);
      }
    } catch {
      /* No manifest for this brand; its current name is all there is. */
    }
  }

  const adopted = await retailerNames();
  const ranges = headingByPage("ranges.json");
  /* Only reached when the product's own words are a size and nothing else:
     "H: 2000 W: 801 - 1200" is a dimension, and "Shower Enclosure" in
     front of it is the difference between a listing and a measurement. */
  const sections = headingByPage("sections.json");
  const pageOf = new Map<string, number>();
  try {
    const manifest = JSON.parse(
      readFileSync(path.join("research", "data", "catalogues", "jaquar", "jaquar-catalogue.json"), "utf8"),
    ) as { products: { code: string; page: number }[] };
    for (const row of manifest.products) if (!pageOf.has(row.code)) pageOf.set(row.code, row.page);
  } catch {
    /* Manifest absent; range prefixes are skipped. */
  }

  /* A heading names a whole range, so several products legitimately come
     out of the PDF with the same name. Identical rows on a shelf are not
     a listing anyone can choose between, so the ones that collide carry
     their model code — which is what a buyer would ask for anyway. */
  const cleaned = products.map((p) => {
    const retail = adopted.get(p.id);
    if (retail) return { ...p, name: retail.replace(/\s+/g, " ").trim(), unusable: false, fromRetail: true };

    const base = clean(original.get(p.sku) ?? p.name);
    const page = pageOf.get(p.sku) ?? -1;

    /* A name that is only a measurement takes its section as a noun. */
    if (base.unusable && DIMENSION_ISH.test(base.name)) {
      const section = sections.get(page);
      if (section) {
        return { ...p, name: `${section} ${base.name}`.trim(), unusable: false, fromRetail: false };
      }
    }

    /* Prefix the range, unless the name already says it. */
    const range = ranges.get(page);
    if (!base.unusable && range) {
      const pretty = titleCase(range);
      if (!base.name.toLowerCase().includes(pretty.toLowerCase())) {
        return { ...p, name: `${pretty} ${base.name}`, unusable: false, fromRetail: false };
      }
    }
    return { ...p, ...base, fromRetail: false };
  });
  const counts = new Map<string, number>();
  for (const c of cleaned) {
    if (!c.unusable) counts.set(c.name.toLowerCase(), (counts.get(c.name.toLowerCase()) ?? 0) + 1);
  }

  let changed = 0;
  let unusable = 0;
  let disambiguated = 0;
  const samples: string[] = [];

  for (const p of cleaned) {
    if (p.unusable) {
      unusable++;
      continue;
    }

    let final = p.name;
    if ((counts.get(p.name.toLowerCase()) ?? 0) > 1) {
      final = `${p.name} (${p.sku})`;
      disambiguated++;
    }
    if (final === p.name && final === products.find((x) => x.id === p.id)?.name) continue;

    const original = products.find((x) => x.id === p.id)!.name;
    if (final === original) continue;

    changed++;
    if (samples.length < 10) samples.push(`  ${original.slice(0, 44).padEnd(46)} -> ${final.slice(0, 50)}`);
    if (!dryRun) {
      await db.product.update({ where: { id: p.id }, data: { name: final } });
    }
  }

  console.info(`${products.length} catalogue products`);
  console.info(`${changed} name(s) ${dryRun ? "would be" : ""} rewritten`);
  console.info(`${cleaned.filter((c) => c.fromRetail).length} took a retailer's own listing name`);
  console.info(`${disambiguated} carried a model code to tell them apart from a namesake`);
  console.info(`${unusable} left alone: the cell never held a name, only a specification`);
  console.info("\nexamples:");
  samples.forEach((s) => console.info(s));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
