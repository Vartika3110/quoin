/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

/**
 * Which live products are the same product listed twice.
 *
 *   npx tsx scripts/audit-duplicate-products.ts
 *   npx tsx scripts/audit-duplicate-products.ts --threshold 0.7
 *
 * Read-only. Writes `reports/duplicate-products.csv` and prints a
 * summary; deciding anything is `resolve-duplicate-products.ts`.
 *
 * The catalogue was built from two imports — a supplier-PDF pass and a
 * scrape of ypanda.in — and the owner's master list is the union of
 * both rather than a resolution of it, so the same goods can sit on the
 * shelf twice at two prices.
 *
 * ## Why the brand is stripped out of the name
 *
 * The first version of this comparison missed a pair and the reason is
 * worth keeping. One Araldite row was called "Standard Epoxy Adhesive
 * Set AW 106 + HV 953 IN" and its twin "Araldite Standard Epoxy
 * Adhesive"; they shared about 30% of their words, under any sensible
 * threshold, so the scan never saw them. 213 of 514 live names omit
 * their brand and 301 carry it, which means that asymmetry is spread
 * across the whole catalogue — any pair split across the two
 * conventions was invisible.
 *
 * Stripping the brand from both sides before comparing fixes it without
 * touching a single row, and it is the honest place for the fix:
 * nothing is wrong with "Angle valve" as the name of a Jaquar angle
 * valve on a page that already says Jaquar. The name was never the
 * defect — reading it without accounting for the brand was.
 *
 * ## Synonyms
 *
 * Only the ones observed in this catalogue, each from a real pair:
 * Colour/Color (SP-100 Part C), & / and, and the hyphen in SP-100
 * against the space in SP 100. Nothing speculative — a synonym that
 * collapses two genuinely different products produces a confident wrong
 * answer, which is worse than a miss.
 *
 * ## What it cannot tell you
 *
 * Whether a pair is one product. It reports candidates and the evidence
 * to judge them by — both prices, both images, the words that differ —
 * because the catalogue is full of pairs that differ by exactly one
 * meaningful word: White against Grey, Interior against Exterior, T04
 * against T06, 315 against 325. Every pair below needs a look at the
 * photographs before anything is deactivated.
 */
const db = new PrismaClient();

const DEFAULT_THRESHOLD = 0.8;
const REPORT = path.join("reports", "duplicate-products.csv");

/**
 * Pairs that have been looked at and cannot be settled here.
 *
 * Not a suppression list. These stay in the report and stay on the
 * shelf; the flag only records that someone has already spent the
 * photographs on them, so a later run is not re-opened as though it
 * were a fresh find.
 *
 * Both entries are the same question — whether an unlabelled bag is the
 * 30 Kg pack its twin names or a 20 Kg one. Dividing price by weight
 * implies about 20 kg for each, but that arithmetic was wrong about MYK
 * Laticrete 307 through 335, where it implied 13-18 kg packs and every
 * bag in fact read 20 kg. The fronts of these bags print no weight, the
 * two scrape sources carry none, and the owner's own image audit
 * records "No match found in supplied PDFs" for all four rows.
 *
 * Deactivating on the arithmetic would delete a real pack size if it is
 * wrong, and leaving a duplicate is the cheaper mistake. It needs the
 * Roff price list.
 */
const PENDING_EXTERNAL: Record<string, string> = {
  "3NPNU|TILROFROF5F84G": "Roff T01: unlabelled bag, 30 Kg twin. Needs the Roff price list.",
  "E2ZPL|TILROFROFT5YB8": "Roff T02: unlabelled bag, 30 Kg twin. Needs the Roff price list.",
};

function pendingNote(a: string, b: string): string | undefined {
  return PENDING_EXTERNAL[`${a}|${b}`] ?? PENDING_EXTERNAL[`${b}|${a}`];
}

/** Observed in this catalogue, each from a confirmed pair. */
const SYNONYMS: [RegExp, string][] = [
  [/\bcolour\b/g, "color"],
  [/\s*&\s*/g, " and "],
];

/**
 * The comparable words of a name: brand removed, synonyms folded,
 * punctuation dropped.
 *
 * Single characters are kept. An earlier pass dropped them and made
 * Supreme's "Y Tee PVC" and "Tee PVC" look identical — a Y-branch and a
 * plain tee, four times apart in price. The one letter was the whole
 * difference.
 */
function words(name: string, brand: string): Set<string> {
  let s = ` ${name.toLowerCase()} `;
  for (const [from, to] of SYNONYMS) s = s.replace(from, to);

  /* Remove the brand wherever it appears, token by token, so that
     "Araldite Standard Epoxy" and "Standard Epoxy" compare equal. Done
     on words rather than as a prefix strip because the brand turns up
     mid-name too ("Fevicol Marine Waterproof Wood Adhesive"). */
  const brandTokens = new Set(
    brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean),
  );

  return new Set(
    s
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0 && !brandTokens.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  const inter = [...a].filter((t) => b.has(t)).length;
  return inter / new Set([...a, ...b]).size;
}

/**
 * The manufacturer's own code for a line, where the name carries one.
 *
 * Word similarity cannot find the largest group of duplicates in this
 * catalogue, and Roff is the clearest case. The two imports describe the
 * same adhesive as "Roff T07 Extrofix Tile Adhesive" and "Roff T07 VFA
 * Tile Adhesive, Grey, 20 Kg Bag" — barely half their words in common,
 * so no threshold that avoids drowning in false positives will pair
 * them. The `T07` is the product; everything around it is prose.
 *
 * Matched conservatively: a letter or two followed by two or three
 * digits ("T07", "SP100", "MA201"), or a bare three-digit model where
 * the brand numbers its lines that way ("315", "325", "201"). Anything
 * looser starts pairing a 20 Kg bag with a 20 W bulb.
 */
function modelCodes(name: string): Set<string> {
  const out = new Set<string>();
  const s = name.toUpperCase().replace(/[^A-Z0-9]+/g, " ");

  const lettered = new Set<string>();
  for (const m of s.matchAll(/\b([A-Z]{1,2})[-\s]?(\d{2,3})\b/g)) {
    out.add(`${m[1]}${m[2].padStart(2, "0")}`);
    lettered.add(m[2]);
  }
  /* Bare model numbers. Three digits only: two-digit numbers in these
     names are almost always a quantity or a wattage.

     Digits already claimed by a lettered code are skipped, or "SP-100"
     also emits "100" and pairs the SP-100 resin kit with the SP-100
     colour powder — two halves of a grout system, four times apart in
     price, which is the opposite of a duplicate. */
  for (const m of s.matchAll(/\b(\d{3})\b/g)) {
    if (!lettered.has(m[1])) out.add(m[1]);
  }

  /* An angle is not a model either: Hettich names two different hinges
     "Corner 165° Zero Protrusion", and the 165 is how far they open. */
  for (const m of name.matchAll(/(\d{2,3})\s?°/g)) out.delete(m[1]);

  /* A measurement is not a model. Dropping these is what keeps "20 Kg
     Bag" from matching "T20". */
  for (const m of s.matchAll(/\b(\d{2,3})\s?(KG|G|ML|L|MM|CM|W|MTR|M|NOS|PCS)\b/g)) {
    out.delete(m[1]);
    out.delete(`${m[1]}`.padStart(2, "0"));
  }
  return out;
}

async function main() {
  const at = process.argv.indexOf("--threshold");
  const threshold = at === -1 ? DEFAULT_THRESHOLD : Number(process.argv[at + 1]);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error("--threshold takes a number between 0 and 1");
  }

  const products = await db.product.findMany({
    where: { isActive: true, variants: { some: { isActive: true } } },
    select: {
      sku: true,
      name: true,
      slug: true,
      image: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      variants: { where: { isActive: true }, orderBy: { pricePaise: "asc" }, select: { pricePaise: true } },
    },
  });

  /* Within a brand only. Across brands the same words describe
     genuinely different goods — twenty live names are shared between
     two manufacturers — and a cross-brand pass reports those as
     candidates forever. */
  const byBrand = new Map<string, typeof products>();
  for (const p of products) {
    const b = p.brand?.name ?? "";
    byBrand.set(b, [...(byBrand.get(b) ?? []), p]);
  }

  interface Pair {
    score: number;
    brand: string;
    a: (typeof products)[number];
    b: (typeof products)[number];
    differing: string[];
    /* Model codes both names carry, which is why the pair is here when
       the words alone did not qualify it. */
    sharedCodes: string[];
  }
  const pairs: Pair[] = [];

  for (const [brand, group] of byBrand) {
    if (!brand) continue;
    const cached = group.map((p) => ({ p, w: words(p.name, brand), codes: modelCodes(p.name) }));
    for (let i = 0; i < cached.length; i++) {
      for (let j = i + 1; j < cached.length; j++) {
        const score = jaccard(cached[i].w, cached[j].w);
        /* A shared model code is evidence in its own right and does not
           have to clear the word threshold — it is there precisely for
           the pairs that cannot. */
        const shared = [...cached[i].codes].filter((c) => cached[j].codes.has(c));
        if (score < threshold && shared.length === 0) continue;
        const differing = [
          ...[...cached[i].w].filter((t) => !cached[j].w.has(t)),
          ...[...cached[j].w].filter((t) => !cached[i].w.has(t)),
        ];
        pairs.push({ score, brand, a: cached[i].p, b: cached[j].p, differing, sharedCodes: shared });
      }
    }
  }

  /* Identical word sets first: those are the ones where no word
     distinguishes the two rows, which is as close to a decision as this
     script is entitled to come. */
  pairs.sort((x, y) => y.score - x.score || x.brand.localeCompare(y.brand));

  const price = (p: (typeof products)[number]) =>
    p.variants.length ? (p.variants[0].pricePaise / 100).toFixed(2) : "";

  const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [
    "score,shared_codes,pending,brand,category,sku_a,name_a,price_a,sku_b,name_b,price_b,differing_words,price_gap_pct",
  ];
  for (const pr of pairs) {
    const pa = Number(price(pr.a));
    const pb = Number(price(pr.b));
    const gap = pa && pb ? ((Math.abs(pa - pb) / Math.max(pa, pb)) * 100).toFixed(0) : "";
    lines.push(
      [
        pr.score.toFixed(2),
        esc(pr.sharedCodes.join(" ")),
        esc(pendingNote(pr.a.sku, pr.b.sku) ?? ""),
        esc(pr.brand),
        esc(pr.a.category?.name ?? ""),
        esc(pr.a.sku),
        esc(pr.a.name),
        price(pr.a),
        esc(pr.b.sku),
        esc(pr.b.name),
        price(pr.b),
        esc(pr.differing.join(" | ")),
        gap,
      ].join(","),
    );
  }

  mkdirSync(path.join(process.cwd(), "reports"), { recursive: true });
  writeFileSync(REPORT, lines.join("\n") + "\n");

  const pending = pairs.filter((p) => pendingNote(p.a.sku, p.b.sku));
  const identical = pairs.filter(
    (p) => p.differing.length === 0 && !pendingNote(p.a.sku, p.b.sku),
  );
  console.info(
    `${products.length} live products, ${pairs.length} candidate pair(s) at >=${threshold}\n`,
  );
  console.info(`${identical.length} pair(s) where no word distinguishes the two rows:\n`);
  for (const pr of identical) {
    console.info(`  ${pr.brand} — ${pr.a.category?.name}`);
    console.info(`    ${pr.a.sku.padEnd(16)} Rs ${price(pr.a).padEnd(9)} ${pr.a.name}`);
    console.info(`    ${pr.b.sku.padEnd(16)} Rs ${price(pr.b).padEnd(9)} ${pr.b.name}\n`);
  }
  if (pending.length) {
    console.info(`${pending.length} pair(s) already reviewed and awaiting outside information:\n`);
    for (const pr of pending) {
      console.info(`  ${pr.a.sku} / ${pr.b.sku}`);
      console.info(`    ${pendingNote(pr.a.sku, pr.b.sku)}\n`);
    }
  }

  console.info(`Full candidate list with evidence: ${REPORT}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
