/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient, type PricingUnit } from "@prisma/client";

/**
 * What is wrong with the catalogue, in one CSV.
 *
 *   npx tsx scripts/audit-catalogue.ts            # report only
 *   npx tsx scripts/audit-catalogue.ts --fix      # …and repair the
 *                                                 # mechanical ones
 *
 * Three thousand rows imported out of manufacturer PDFs and a retailer
 * scrape carry damage that nobody can see by opening the storefront and
 * scrolling: a name that begins with a stray bracket, a price that leaked
 * into the title, a 20-litre tub priced "Per Ltr". Each is invisible
 * alone and collectively they are why a catalogue reads as untended.
 *
 * **The split between what this fixes and what it reports is the whole
 * design.** A fix is applied only where the correct result is derivable
 * from the row itself and is not a judgement — stripping a leading `(`,
 * collapsing doubled spaces. Everything that needs somebody to decide
 * what a thing costs or what it is called goes in the CSV with the
 * evidence beside it. Guessing at either is how a catalogue acquires
 * wrong prices, which is worse than an untidy one: an untidy price is
 * embarrassing and a wrong one is a refund.
 *
 * `--fix` never touches money. Not one of the repairs below changes a
 * price, a unit or a variant.
 */
const db = new PrismaClient();

const OUT = path.join("reports", "catalogue-audit.csv");

/* ---- Findings ------------------------------------------------------------ */

type Severity = "fixed" | "review";

interface Finding {
  severity: Severity;
  kind: string;
  sku: string;
  slug: string;
  name: string;
  detail: string;
  /** What `--fix` wrote, where it wrote anything. */
  fixedTo: string;
}

/* ---- Name repairs -------------------------------------------------------- */

/**
 * Punctuation a name may legitimately *contain* but never open with.
 *
 * `(` and `[` lead the list because the PDF extractor emits a bracketed
 * qualifier first whenever a cell wrapped — "(Drain Pipe)* with Overflow"
 * is the shape. `*` and `|` are table artefacts. A `-` or `—` opening a
 * name is a bullet that lost its list.
 */
const LEADING_JUNK = /^[\s(\[\]{}*|·•\-–—_,.:;>«"'`]+/;
const TRAILING_JUNK = /[\s*|·•\-–—_,:;<»`]+$/;

/** Collapses the doubled spaces a two-column wrap leaves behind. */
function tidy(name: string): string {
  return name
    .replace(LEADING_JUNK, "")
    .replace(TRAILING_JUNK, "")
    .replace(/\s{2,}/g, " ")
    /* An unbalanced closing bracket left over once the opener has been
       stripped: "Drain Pipe)* with Overflow" -> "Drain Pipe with
       Overflow". Only when there is no opener anywhere in the name, so a
       legitimate "(15 L)" is untouched. */
    .replace(/^([^()]*)\)/, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * A run of digits that is a price rather than a specification.
 *
 * The first version of this asked only that a number carry no unit, and
 * it reported 429 rows of which almost all were "35000 RPM", "13000 RPM"
 * and "18000ST 150Ah" — the specification a power tool is *sold on*. A
 * rule that flags four hundred correct names to catch forty broken ones
 * does not get read, and an audit nobody reads is worse than none.
 *
 * Two shapes are a price and nothing else is:
 *
 *  1. **Indian digit grouping** — `29,000`, `3,450`. Nothing in this
 *     catalogue writes a specification with a comma in it.
 *  2. **A run of two or more bare numbers at the very end** — the
 *     "…with Overflow 29,000 3,450" tail, where the extractor took the
 *     MRP and the sell price out of the next two table cells. One
 *     trailing number is a model or a size and is left alone.
 *
 * Reported, never stripped. Even at this precision the number might be a
 * model code, and a product renamed wrongly is harder to notice than one
 * named badly.
 */
const UNIT_SUFFIX =
  /^(?:mm|cm|mtr|m|ml|ltr|l|kg|gm?|w|kw|watt|v|volt|a|ah|mah|amp|hz|rpm|lm|k|nos|pcs|pack|ply|mesh|tpi|bar|psi|inch|in|ft|sqft|deg|°|x|×)\b/i;

function priceLikeNumbers(name: string): string[] {
  const grouped = [...name.matchAll(/\b\d{1,3}(?:,\d{2,3})+\b/g)].map((m) => m[0]);

  /* A trailing run of bare numbers, none of which carries a unit. */
  const trailing: string[] = [];
  const tail = /(\d{3,})(?:\s+|$)/g;
  const words = name.trim().split(/\s+/);
  let i = words.length - 1;
  while (i >= 0 && /^\d{3,}$/.test(words[i])) {
    trailing.unshift(words[i]);
    i -= 1;
  }
  void tail;

  const found = [...grouped, ...(trailing.length >= 2 ? trailing : [])];

  /* Drop anything immediately followed by a unit — "150 Ah", "6 mm". */
  return found.filter((n) => {
    const at = name.indexOf(n);
    return !UNIT_SUFFIX.test(name.slice(at + n.length).trimStart());
  });
}

/* ---- Unit sanity --------------------------------------------------------- */

/**
 * A pack size written into the name, and the unit the row is priced in.
 *
 * "Apcolite Premium Emulsion 20 L" priced `PER_LITRE` is the failure this
 * looks for: the price is almost certainly for the tub, so the storefront
 * says "₹4,200 Per Ltr" on a 20-litre tub and multiplies it by twenty in
 * the cart. Whether the fix is to re-unit the row or divide the price is
 * a decision about what the supplier actually charges, which is why this
 * is reported and never repaired.
 */
const PACK_SIZE = /(\d+(?:\.\d+)?)\s*(l|ltr|litre|liters?|kg|g|ml)\b/i;

const UNIT_FOR_PACK: Partial<Record<string, PricingUnit>> = {
  l: "PER_LITRE",
  ltr: "PER_LITRE",
  litre: "PER_LITRE",
  liter: "PER_LITRE",
  liters: "PER_LITRE",
  kg: "PER_KG",
};

async function main() {
  const fix = process.argv.includes("--fix");

  const products = await db.product.findMany({
    select: {
      id: true,
      sku: true,
      slug: true,
      name: true,
      image: true,
      sourceImageUrl: true,
      pricingUnit: true,
      isActive: true,
      variants: { select: { id: true, sku: true, label: true, pricePaise: true } },
    },
    orderBy: { sku: "asc" },
  });

  const findings: Finding[] = [];
  const seenSku = new Map<string, string>();
  let repaired = 0;

  for (const product of products) {
    const row = (kind: string, detail: string, severity: Severity = "review", fixedTo = "") =>
      findings.push({
        severity,
        kind,
        sku: product.sku,
        slug: product.slug,
        name: product.name,
        detail,
        fixedTo,
      });

    /* ---- Duplicate SKUs.

       `Product.sku` is unique, so a literal collision cannot exist. What
       does exist is the same SKU written two ways — trailing whitespace,
       a different case — which the database reads as two products and a
       buyer reads as one. Normalised before comparing, which is the only
       way to see them. */
    const key = product.sku.trim().toLowerCase();
    const first = seenSku.get(key);
    if (first) row("duplicate-sku", `Same SKU as ${first} once trimmed and lower-cased`);
    else seenSku.set(key, product.slug);

    /* ---- Missing photography. */
    if (!product.image) {
      row(
        "missing-image",
        product.sourceImageUrl
          ? "No Quoin image; a source URL exists but is gated behind SHOW_SOURCE_IMAGES"
          : "No image of any kind — renders the 'photo coming soon' tile",
      );
    }

    /* ---- Names. */
    const tidied = tidy(product.name);
    if (tidied !== product.name && tidied.length > 0) {
      if (fix) {
        await db.product.update({ where: { id: product.id }, data: { name: tidied } });
        repaired += 1;
      }
      row(
        "stray-punctuation",
        `Name opens or closes with punctuation: ${JSON.stringify(product.name)}`,
        fix ? "fixed" : "review",
        tidied,
      );
    }

    const prices = priceLikeNumbers(tidied);
    if (prices.length > 0) {
      row(
        "price-in-name",
        `Looks like a price or a model number in the title: ${prices.join(", ")}`,
      );
    }

    /* ---- Units. */
    const pack = PACK_SIZE.exec(tidied);
    if (pack) {
      const size = Number(pack[1]);
      const expected = UNIT_FOR_PACK[pack[2].toLowerCase()];
      if (expected && product.pricingUnit === expected && size > 1) {
        const cheapest = Math.min(...product.variants.map((v) => v.pricePaise));
        row(
          "unit-mismatch",
          `Name says ${pack[1]}${pack[2]} but the row is priced ${product.pricingUnit}. ` +
            `Either re-unit it, or the price is for the pack and should be divided by ${size}. ` +
            `Cheapest variant: ${(cheapest / 100).toFixed(2)}`,
        );
      }
    }

    /* ---- Nothing to sell. */
    if (product.variants.length === 0) {
      row("no-variant", "Active product with no variants — cannot be priced or bought");
    } else if (product.variants.every((v) => v.pricePaise <= 0)) {
      row("no-price", "Every variant is priced at zero");
    }
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, toCsv(findings), "utf8");

  const byKind = new Map<string, number>();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);

  console.log(`[audit] ${products.length} products read.`);
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`[audit]   ${String(count).padStart(5)}  ${kind}`);
  }
  console.log(`[audit] ${findings.length} findings -> ${OUT}`);
  console.log(
    fix
      ? `[audit] ${repaired} names repaired. Everything else is a judgement and is reported only.`
      : "[audit] Report only. Re-run with --fix to repair the mechanical name damage.",
  );
}

/** RFC 4180: quote everything, double the quotes inside. Product names
    contain commas, quotes and the occasional newline. */
function toCsv(rows: Finding[]): string {
  const header = ["severity", "kind", "sku", "slug", "name", "detail", "fixedTo"];
  const cell = (v: string) => `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  return [
    header.join(","),
    ...rows.map((r) =>
      [r.severity, r.kind, r.sku, r.slug, r.name, r.detail, r.fixedTo].map(cell).join(","),
    ),
  ].join("\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
