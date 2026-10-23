import { db } from "@/lib/db";
import { listProductsBySlugs } from "@/lib/data/catalog";
import { MONEY_MOVED_STATUSES } from "@/lib/orders/status-groups";
import type { Product } from "@/lib/types/catalog";

/**
 * What is actually moving right now.
 *
 * ## Why this is not `getBestsellers`
 *
 * Bestsellers is a total: what has sold the most, ever. Trending is a
 * derivative — what has picked up *lately* — and the two answer different
 * questions. A cement brand can be the bestseller every month of the year
 * and never be trending; a tile that nobody bought until last fortnight
 * is trending and will never top a lifetime count.
 *
 * So this counts a trailing window, and it counts two signals rather than
 * one:
 *
 *  - **Orders placed in the window**, from orders where money actually
 *    moved. The strongest signal there is, and the one that cannot be
 *    gamed by browsing.
 *  - **Wishlist adds in the window**, weighted lower. Hearting something
 *    is intent rather than purchase, which is exactly what makes it a
 *    *leading* indicator — on a catalogue this young it is also the only
 *    signal with enough volume to say anything.
 *
 * Both tables key products by `productSlug` rather than by a foreign key
 * — see the note on `WishlistItem.productSlug` — so one `UNION ALL` over
 * two slug columns is the whole ranking.
 *
 * ## It refuses to invent a trend
 *
 * If the window holds too little activity to rank anything, this returns
 * `{ basis: "newest" }` and the newest sellable products in the relevant
 * departments instead — and the page **says so in those words**. That is
 * the honest state for a catalogue that has taken few orders, and it is
 * the same rule `getBestsellers` follows by coming back short rather than
 * padding itself from the catalogue. A row labelled "trending" that is
 * really "whatever we imported last" teaches a customer that the labels
 * on this site are decorative.
 */

/**
 * How far back "lately" reaches.
 *
 * Thirty days. Shorter and a single bulk order dominates the list;
 * longer and it stops being a trend and becomes a bestseller list with
 * extra steps.
 */
const WINDOW_DAYS = 30;

/**
 * How much a wishlist add is worth against an order line.
 *
 * A third. Deliberately a judgement, written down rather than buried: a
 * purchase is strictly better evidence than a save, and the ratio only
 * has to be *roughly* right for the ordering to be sensible. It is here
 * as a named constant so that changing it is a decision somebody makes
 * on purpose.
 */
const WISHLIST_WEIGHT = 0.34;

/**
 * Below this, there is no trend — only noise.
 *
 * Four distinct products with real activity. With fewer, the "top ten"
 * is whichever three things one customer happened to buy, and presenting
 * that as what the market is doing is a straightforward lie.
 */
const MIN_PRODUCTS = 4;

/**
 * The departments this page covers: interiors and exteriors.
 *
 * The brief asks for "home interior and exterior", which is not a
 * department in this catalogue — Quoin's fourteen are materials and
 * fittings. So it is spelled out as the departments a customer doing up
 * a home actually buys from, and the structural trades (cement and
 * steel, tools, waterproofing, gypsum) are left out: a trending list is
 * about what a home looks like, and nobody browses trending cement.
 *
 * An explicit list rather than a guess, so adding or removing a
 * department here is one line and visible in review.
 */
export const TRENDING_DEPARTMENTS = [
  "tiling-adhesives",
  "bathware-plumbing",
  "kitchen-sinks-faucets",
  "electricals-lighting",
  "paints-finishes",
  "plywood-laminates",
  "hardware-locks",
  "kitchen-wardrobe-fittings",
  "home-appliances-security",
] as const;

export interface TrendingResult {
  /**
   * `measured` — ranked from real orders and saves in the window.
   * `newest` — not enough activity to rank anything, so these are the
   * most recently added products instead. The page must say which.
   */
  basis: "measured" | "newest";
  items: Product[];
  /** How many days the measurement covers. Shown, so the claim is dated. */
  windowDays: number;
}

export async function getTrending(limit = 24): Promise<TrendingResult> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  /* Grouped in Postgres rather than by pulling every line and every
     wishlist row into Node — both tables grow with use, and the same
     reasoning `getBestsellers` records applies. One query, two sources.

     `LIMIT` is generous relative to `limit` because the hydrate below
     drops anything no longer sellable, and a slug that has been retired
     since it was ordered must not leave a hole in the grid. */
  const ranked = await db.$queryRaw<{ productSlug: string; score: number }[]>`
    SELECT "productSlug", SUM(weight) AS score
    FROM (
      SELECT l."productSlug" AS "productSlug", l.qty::float AS weight
      FROM order_lines l
      JOIN orders o ON o.id = l."orderId"
      WHERE o.status = ANY(${MONEY_MOVED_STATUSES}::text[]::"OrderStatus"[])
        AND o."createdAt" >= ${since}
      UNION ALL
      SELECT w."productSlug" AS "productSlug", ${WISHLIST_WEIGHT}::float AS weight
      FROM wishlist_items w
      WHERE w."createdAt" >= ${since}
    ) AS signals
    GROUP BY "productSlug"
    ORDER BY score DESC
    LIMIT ${limit * 3}
  `;

  if (ranked.length >= MIN_PRODUCTS) {
    const slugs = ranked.map((row) => row.productSlug);
    const products = await listProductsBySlugs(slugs);

    /* Restored to the order the ranking produced — `IN` does not preserve
       it — and filtered to the departments this page covers, because a
       bag of cement trending is not what somebody browsing interiors
       came for. */
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const inDepartment = await departmentFilter();

    const items = slugs
      .flatMap((slug) => bySlug.get(slug) ?? [])
      .filter((product) => inDepartment(product.categoryId))
      .slice(0, limit);

    /* Enough signal overall but none of it in these departments — a
       fortnight of nothing but cement. Falls through to `newest` rather
       than returning an empty "trending" grid. */
    if (items.length >= MIN_PRODUCTS) {
      return { basis: "measured", items, windowDays: WINDOW_DAYS };
    }
  }

  return { basis: "newest", items: await newestInDepartments(limit), windowDays: WINDOW_DAYS };
}

/**
 * A predicate over `Product.categoryId`, built from one query.
 *
 * `Product` carries the category's id, not its slug, so the slugs above
 * have to be resolved once. Returned as a closure rather than a set so
 * the call site reads as the question it is asking.
 */
async function departmentFilter(): Promise<(categoryId: string) => boolean> {
  const rows = await db.category.findMany({
    where: { slug: { in: [...TRENDING_DEPARTMENTS] } },
    select: { id: true },
  });
  const ids = new Set(rows.map((row) => row.id));
  /* No matching departments at all would mean the slugs above have drifted
     from the catalogue. Letting everything through is the kinder failure:
     a page of real products in the wrong order beats an empty one. */
  if (ids.size === 0) return () => true;
  return (categoryId: string) => ids.has(categoryId);
}

/**
 * The honest fallback: the newest sellable products in these departments.
 *
 * ## Round-robin across brands, not straight `createdAt desc`
 *
 * The obvious implementation returns one supplier's last import, and that
 * is not a bug in the ordering — it is what "newest" means on a catalogue
 * filled in batches. The first version of this page proved it: twenty-four
 * products, every one of them Ozone, because Ozone was the most recent
 * sheet loaded. The same mistake is recorded twice elsewhere in this
 * codebase — `listRailProducts` ("whatever the last import happened to
 * contain, which puts one supplier's batch at the front of a shelf") and
 * the home page's "More to explore", which round-robins across
 * departments for exactly this reason.
 *
 * So: take each brand's newest, then deal one from each in turn. The
 * result is still genuinely the newest stock, and it reads as a page
 * about the catalogue rather than about one purchase order.
 *
 * Photographed sorts ahead of illustrated within a brand. Unlike
 * `getTopPicks`, illustrated products are not excluded outright — this
 * page has to fill a grid and the card already labels an illustration.
 */
async function newestInDepartments(limit: number): Promise<Product[]> {
  const rows = await db.product.findMany({
    where: {
      isActive: true,
      variants: { some: { isActive: true } },
      category: { slug: { in: [...TRENDING_DEPARTMENTS] } },
    },
    select: {
      slug: true,
      image: true,
      imageIsGenerated: true,
      brandId: true,
    },
    orderBy: { createdAt: "desc" },
    /* Wide enough that several brands are represented even when one
       supplier dominates the head of the list. A single batch import can
       be hundreds of rows, which is precisely the case this guards. */
    take: limit * 30,
  });

  /* One queue per brand, each already newest-first because Postgres
     returned them that way and `sort` below is stable. A product with no
     brand queues under a single empty key rather than one queue each. */
  const byBrand = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.brandId ?? "";
    const queue = byBrand.get(key) ?? [];
    queue.push(row);
    byBrand.set(key, queue);
  }

  const queues = [...byBrand.values()].map((queue) =>
    [...queue].sort((a, b) => rank(b) - rank(a)),
  );

  /* Deal one from each brand in turn until the grid is full or every
     queue is spent. */
  const ordered: typeof rows = [];
  for (let depth = 0; ordered.length < limit; depth += 1) {
    const before = ordered.length;
    for (const queue of queues) {
      if (ordered.length === limit) break;
      const row = queue[depth];
      if (row) ordered.push(row);
    }
    if (ordered.length === before) break;
  }

  const products = await listProductsBySlugs(ordered.map((r) => r.slug));
  /* `listProductsBySlugs` documents that it returns in no particular
     order, so the order decided above is restored here rather than
     assumed. */
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return ordered.flatMap((row) => bySlug.get(row.slug) ?? []);
}

function rank(row: { image: string; imageIsGenerated: boolean }): number {
  if (row.image && !row.imageIsGenerated) return 2;
  if (row.image) return 1;
  return 0;
}

/* Re-exported so a page can cite the window in its own copy without
   importing a private constant. */
export { WINDOW_DAYS as TRENDING_WINDOW_DAYS };
