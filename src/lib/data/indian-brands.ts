import { db } from "@/lib/db";
import { brandKey, listProductsBySlugs } from "@/lib/data/catalog";
import type { Product } from "@/lib/types/catalog";

/**
 * Rooted: the Indian brands, and Quoin's own.
 *
 * ## Why this is a maintained list and not a column
 *
 * There is no `country` on `Brand`, and there should not be one until
 * somebody is willing to own the data: a brand's nationality is a claim
 * about a company, not a property of a catalogue row, and the importer
 * has no idea where anything is from. Guessing it from the name would put
 * Häfele in the Indian list the first time somebody dropped the umlaut.
 *
 * So it is an explicit list, in the open, where a wrong entry is a
 * one-line fix in review rather than a data migration. Two lists, in
 * fact, because they are two different claims:
 *
 *  - `INDIAN_BRANDS` — founded and headquartered in India. These are
 *    well-known Indian manufacturers; every one here is a company whose
 *    Indian origin is a matter of public record, not an inference.
 *  - `FOREIGN_BRANDS` — founded and headquartered elsewhere. Kept
 *    deliberately, even though nothing renders it, because it is what
 *    makes the first list *auditable*: a brand in neither list is
 *    unclassified and simply does not appear on the page, and a reviewer
 *    can see at a glance that Hettich was excluded on purpose rather than
 *    forgotten.
 *
 * A brand Quoin stocks that is in neither list is not shown here. That is
 * the right failure: an Indian brand missing from Rooted is a gap
 * somebody notices and fills, whereas a German brand wrongly shown on it
 * is a false claim on a page whose entire proposition is provenance.
 *
 * ## Quoin's own brands
 *
 * `QUOIN_BRANDS` are the house lines — MARS today. They are Indian and
 * they are also ours, which is a different thing to say about them, so
 * the page separates them rather than mixing them in. `BRAND_WALL` makes
 * the same distinction and for the same reason: "it is ours, so it does
 * not vouch for us".
 */

/**
 * Indian-founded, Indian-headquartered manufacturers.
 *
 * Matched through `brandKey`, the same normaliser the catalogue uses to
 * reconcile brand spellings between imports — so "Asian Paints", "ASIAN
 * PAINTS" and "asian-paints" are one entry rather than three.
 *
 * Additions are a business decision and belong here, reviewed. Nothing in
 * this list is inferred from a product name.
 *
 * Two kinds of entry are deliberately absent. **Indian subsidiaries of
 * foreign companies** — "Kohler India", "Yale India" — because the
 * importer spells the brand the way the source sheet does ("Kohler"), so
 * the suffixed name never matches anything, and matching the unsuffixed
 * one would put an American company on this page. And **bare words that
 * two companies share**: "Johnson" is here as `hr johnson` and `prism
 * johnson`, not as `johnson`, which would also claim Johnson Controls.
 */
export const INDIAN_BRANDS: readonly string[] = [
  /* Bath, sanitaryware and plumbing. */
  "jaquar",
  "hindware",
  "cera",
  "parryware",
  "sintex",
  "astral",
  "supreme",
  "prince",
  "finolex",
  "ashirvad",
  "truflo",
  /* Tiles, stone and surfaces. */
  "kajaria",
  "somany",
  "nitco",
  "orient bell",
  "hr johnson",
  "prism johnson",
  "varmora",
  "simpolo",
  "asian granito",
  /* Paints and finishes. */
  "asian paints",
  "berger",
  "nerolac",
  "indigo paints",
  "shalimar",
  "pidilite",
  "fevicol",
  "dr fixit",
  "roff",
  /* Cement, steel and structure. */
  "ultratech",
  "ambuja",
  "acc",
  "shree cement",
  "dalmia",
  "jk cement",
  "jk lakshmi",
  "birla",
  "ramco",
  "tata steel",
  "tata tiscon",
  "jsw",
  "sail",
  "kamdhenu",
  /* Boards, ply and laminates. */
  "century ply",
  "centuryply",
  "greenply",
  "kitply",
  "merino",
  "royale touche",
  "archidply",
  "austin ply",
  /* Electricals, wiring and lighting. */
  "havells",
  "polycab",
  "anchor",
  "rr kabel",
  "kei",
  "orient electric",
  "orient",
  "crompton",
  "bajaj",
  "syska",
  "wipro",
  "surya",
  "halonix",
  "v guard",
  "luminous",
  /* Hardware, fittings and locks. */
  "ebco",
  "ozone",
  "dorset",
  "godrej",
  "harrison",
  "plaza",
  "enox",
  "argent",
  /* Appliances, tools and safety. */
  "usha",
  "kaff",
  "glen",
  "taparia",
  "jk files",
  "cri",
  "kirloskar",
];

/**
 * Founded and headquartered outside India.
 *
 * Nothing renders this. It exists so that the exclusions on this page are
 * a decision on the record — see the note above.
 */
export const FOREIGN_BRANDS: readonly string[] = [
  "hettich",
  "hafele",
  "blum",
  "grass",
  "salice",
  "grohe",
  "duravit",
  "roca",
  "toto",
  "american standard",
  "geberit",
  "bosch",
  "makita",
  "dewalt",
  "stanley",
  "black decker",
  "hilti",
  "fischer",
  "sika",
  "mapei",
  "weber",
  "ardex",
  "legrand",
  "schneider",
  "siemens",
  "abb",
  "philips",
  "osram",
  "panasonic",
  "hager",
  "knauf",
  "saint gobain",
  "gyproc",
  "wurth",
  "assa abloy",
  "dormakaba",
  "kwikset",
];

/** Quoin's own lines. Indian, and ours — two separate facts. */
export const QUOIN_BRANDS: readonly string[] = ["mars", "quoin"];

const INDIAN_KEYS = new Set(INDIAN_BRANDS.map(brandKey));
const QUOIN_KEYS = new Set(QUOIN_BRANDS.map(brandKey));

/** Whether a brand name is on the Indian list. Exported for the page's
    own copy, and for a test to assert the two lists never overlap. */
export function isIndianBrand(name: string): boolean {
  const key = brandKey(name);
  return INDIAN_KEYS.has(key) || QUOIN_KEYS.has(key);
}

export function isQuoinBrand(name: string): boolean {
  return QUOIN_KEYS.has(brandKey(name));
}

export interface RootedBrand {
  slug: string;
  name: string;
  /** Live, sellable products filed under it. */
  productCount: number;
  /** True for a Quoin house line. The page says so on the card. */
  isHouseBrand: boolean;
}

/**
 * The Indian brands Quoin actually stocks, with their depth.
 *
 * Derived from the catalogue and then filtered by the list above, never
 * the other way round: a brand on the list with nothing sellable under it
 * is not shown, because it would be a logo linking to an empty shelf.
 */
export async function listRootedBrands(): Promise<RootedBrand[]> {
  const rows = await db.brand.findMany({
    where: {
      products: { some: { isActive: true, variants: { some: { isActive: true } } } },
    },
    select: {
      slug: true,
      name: true,
      _count: {
        select: { products: { where: { isActive: true, variants: { some: { isActive: true } } } } },
      },
    },
  });

  const indian = rows
    .filter((row) => isIndianBrand(row.name))
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      productCount: row._count.products,
      isHouseBrand: isQuoinBrand(row.name),
    }));

  /* The importer has left near-duplicate brand rows behind — "Dr Fixit"
     and "Dr. Fixit", "UltraTech" and "Ultratech" are each one company —
     and a grid showing both reads as a bug to a customer. Folded the same
     way `getBrandLinkTargets` folds them, and for the same reason it
     gives: the fuller of the two wins, and **the counts are deliberately
     not summed**, because the card links to one brand's shelf and a
     total that includes the other brand's rows would overstate what is
     behind the link.

     Done here rather than in the query because Postgres has no index on
     a normalised name, and the set is small. */
  const folded = new Map<string, (typeof indian)[number]>();
  for (const brand of indian) {
    const key = brandKey(brand.name);
    const existing = folded.get(key);
    if (!existing || brand.productCount > existing.productCount) folded.set(key, brand);
  }

  return [...folded.values()]
    /* House brands first, then by depth: Rooted is a page about Indian
       manufacturing, and Quoin's own line is the part of it Quoin is
       answerable for. */
    .sort(
      (a, b) =>
        Number(b.isHouseBrand) - Number(a.isHouseBrand) || b.productCount - a.productCount,
    );
}

/**
 * Products from Indian brands, for the page's shelves.
 *
 * Two shelves, one query each: the house lines, and everything else
 * Indian. Photographed first within both, because this page is a wall of
 * products rather than a filter panel.
 */
export async function listRootedProducts(input: {
  brandSlugs: string[];
  limit: number;
}): Promise<Product[]> {
  if (input.brandSlugs.length === 0) return [];

  const rows = await db.product.findMany({
    where: {
      isActive: true,
      variants: { some: { isActive: true } },
      brand: { slug: { in: input.brandSlugs } },
    },
    select: { slug: true, image: true, imageIsGenerated: true },
    orderBy: { name: "asc" },
    take: input.limit * 6,
  });

  const ordered = [...rows]
    .sort((a, b) => pictureRank(b) - pictureRank(a))
    .slice(0, input.limit);

  const products = await listProductsBySlugs(ordered.map((r) => r.slug));
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return ordered.flatMap((row) => bySlug.get(row.slug) ?? []);
}

function pictureRank(row: { image: string; imageIsGenerated: boolean }): number {
  if (row.image && !row.imageIsGenerated) return 2;
  if (row.image) return 1;
  return 0;
}
