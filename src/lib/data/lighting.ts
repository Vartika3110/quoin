import { db } from "@/lib/db";
import { listProductsBySlugs } from "@/lib/data/catalog";
import type { Product } from "@/lib/types/catalog";

/**
 * Decorative lighting: the jhoomar, the hanging light, the lamp.
 *
 * ## The problem this solves
 *
 * `electricals-lighting` is one department holding two completely
 * different shopping trips. Most of its rows are wiring accessories —
 * switches, sockets, MCBs, conduit, cable — bought by an electrician who
 * knows exactly which part they need. A handful are light *fittings*,
 * bought by somebody choosing how a room will look. Sending the second
 * customer to `/c/electricals-lighting` buries four chandeliers under
 * four hundred modular switches.
 *
 * ## Why this is a keyword filter, and what that costs
 *
 * This catalogue has no attribute table. There is no `fittingType`
 * column, no tags, and `getProductFacets` records the same limitation for
 * material, finish and size: "those filters would be empty controls that
 * never change a result". So the only thing available to filter on is the
 * product name, and the only honest thing to do is say so.
 *
 * What that costs, stated plainly rather than discovered later:
 *
 *  - **It will miss things.** A decorative fitting whose name is a bare
 *    model number will not appear here. The department page still has it.
 *  - **It will over-match occasionally.** "Lamp holder" is a wiring
 *    accessory, not a lamp, which is why `EXCLUDE` exists below and is
 *    applied after `INCLUDE` rather than before.
 *
 * Both are better than the alternatives, which are an empty page or a
 * hand-curated list of slugs that silently rots at the next import. The
 * day the catalogue grows attributes, this becomes a real filter and the
 * page does not change.
 */

/**
 * Words that mean "this is a decorative light fitting".
 *
 * Indian trade and household vocabulary alongside the catalogue's own:
 * `jhoomar` is what a chandelier is called by most of the people buying
 * one, and a lighting page that does not match the word they would type
 * is a lighting page they cannot find anything in.
 *
 * Matched case-insensitively as substrings against the product name,
 * which is why several entries are stems — "pendant" catches "Pendant
 * Light" and "Pendant Lamp Shade" both.
 */
const INCLUDE = [
  "chandelier",
  "jhoomar",
  "jhumar",
  "pendant",
  "hanging light",
  "hanging lamp",
  "lamp shade",
  "lampshade",
  "table lamp",
  "floor lamp",
  "wall lamp",
  "wall light",
  "sconce",
  "ceiling light",
  "ceiling lamp",
  "cove light",
  "track light",
  "spot light",
  "spotlight",
  "downlight",
  "down light",
  "panel light",
  "strip light",
  "mirror light",
  "picture light",
  "gate light",
  "garden light",
  "bollard",
  "lantern",
  "diya",
  "night lamp",
  "decorative light",
  "fancy light",
  "led strip",
  "profile light",
  "linear light",
  "surface light",
  "flush light",
  "bulkhead",
] as const;

/**
 * Words that mean "this is a component, not a fitting".
 *
 * Applied *after* `INCLUDE`, so a row has to match a lighting word and
 * then survive this list. "Lamp holder", "light switch" and "driver" all
 * contain a lighting word and are none of them something a customer
 * chooses a room around.
 */
const EXCLUDE = [
  "holder",
  "switch",
  "socket",
  "driver",
  "ballast",
  "starter",
  "choke",
  "fitting kit",
  "bracket",
  "clamp",
  "conduit",
  "cable",
  "wire",
  "mcb",
  "rccb",
  "fuse",
  "connector",
  "adaptor",
  "adapter",
  "regulator",
  "dimmer module",
  "sensor module",
  "spare",
  "accessory",
  "accessories",
  "mounting",
  "gland",
  "junction",
  "tube only",
  "rod only",
] as const;

/**
 * The departments searched.
 *
 * Lighting lives in electricals, and the occasional decorative fitting
 * is filed under appliances or hardware. Searching those three rather
 * than the whole catalogue keeps "lantern" from returning a garden
 * ornament filed under tools.
 */
const DEPARTMENTS = ["electricals-lighting", "home-appliances-security", "hardware-locks"];

export interface LightingGroup {
  /** The shelf heading. */
  title: string;
  /** Which `INCLUDE` words belong to this shelf. */
  match: readonly string[];
  items: Product[];
}

/**
 * The shelves, in the order somebody shops them.
 *
 * Statement pieces first — the jhoomar is why this page exists — then
 * the lights that do a job, then the outdoor ones. A product matching
 * two shelves lands on the first, so the order here is also the
 * precedence.
 */
const GROUPS: { title: string; match: readonly string[] }[] = [
  {
    title: "Chandeliers & jhoomar",
    match: ["chandelier", "jhoomar", "jhumar", "lantern"],
  },
  {
    title: "Hanging & pendant lights",
    match: ["pendant", "hanging light", "hanging lamp", "linear light"],
  },
  {
    title: "Lamps",
    match: ["table lamp", "floor lamp", "night lamp", "lamp shade", "lampshade"],
  },
  {
    title: "Wall lights",
    match: ["wall light", "wall lamp", "sconce", "mirror light", "picture light", "bulkhead"],
  },
  {
    title: "Ceiling & recessed",
    match: [
      "ceiling light",
      "ceiling lamp",
      "downlight",
      "down light",
      "panel light",
      "surface light",
      "flush light",
      "spot light",
      "spotlight",
      "track light",
    ],
  },
  {
    title: "Cove, strip & profile",
    match: ["cove light", "strip light", "led strip", "profile light"],
  },
  {
    title: "Outdoor & garden",
    match: ["gate light", "garden light", "bollard", "diya"],
  },
  {
    title: "Other decorative lighting",
    match: ["decorative light", "fancy light"],
  },
];

/**
 * Every decorative light fitting Quoin stocks, grouped.
 *
 * One query, not one per shelf. The grouping is done in memory because
 * it is a classification over names that Postgres has no index for
 * anyway — and because `getTopPicks` records what a shelf-per-query
 * fan-out costs this deployment's connection pool.
 */
export async function listDecorativeLighting(perGroup = 24): Promise<LightingGroup[]> {
  const rows = await db.product.findMany({
    where: {
      isActive: true,
      variants: { some: { isActive: true } },
      category: { slug: { in: DEPARTMENTS } },
      OR: INCLUDE.map((word) => ({
        name: { contains: word, mode: "insensitive" as const },
      })),
    },
    select: { slug: true, name: true, image: true, imageIsGenerated: true },
    orderBy: { name: "asc" },
    /* A ceiling on how much is classified in memory. The real set is in
       the low hundreds; this is the guard, not the expectation. */
    take: 1_200,
  });

  /* The component filter, applied after the lighting match — see
     `EXCLUDE`. */
  const fittings = rows.filter((row) => {
    const name = row.name.toLowerCase();
    return !EXCLUDE.some((word) => name.includes(word));
  });

  /* Photographed first within each shelf: a lighting page is chosen by
     eye, and a brand-initial swatch tells a customer nothing about what
     a jhoomar looks like. */
  const sorted = [...fittings].sort((a, b) => pictureRank(b) - pictureRank(a));

  /* Classified first, hydrated once. Hydrating inside the loop would be
     one round trip per shelf — eight, sequentially — for a page that can
     be served with two. */
  const used = new Set<string>();
  const assigned: { title: string; match: readonly string[]; slugs: string[] }[] = [];

  for (const group of GROUPS) {
    const slugs: string[] = [];
    for (const row of sorted) {
      if (used.has(row.slug)) continue;
      const name = row.name.toLowerCase();
      if (!group.match.some((word) => name.includes(word))) continue;
      used.add(row.slug);
      slugs.push(row.slug);
      if (slugs.length === perGroup) break;
    }
    if (slugs.length > 0) assigned.push({ ...group, slugs });
  }

  const products = await listProductsBySlugs(assigned.flatMap((g) => g.slugs));
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  return assigned
    .map((group) => ({
      title: group.title,
      match: group.match,
      /* `listProductsBySlugs` returns in no particular order and drops
         anything retired, so the shelf's own order is restored here. */
      items: group.slugs.flatMap((slug) => bySlug.get(slug) ?? []),
    }))
    .filter((group) => group.items.length > 0);
}

function pictureRank(row: { image: string; imageIsGenerated: boolean }): number {
  if (row.image && !row.imageIsGenerated) return 2;
  if (row.image) return 1;
  return 0;
}
