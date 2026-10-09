import type {
  BadgeKind,
  CatalogTab,
  Category,
  FulfilmentType,
  PricingUnit,
  Product,
  Variant,
} from "@/lib/types/catalog";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { MONEY_MOVED_STATUSES } from "@/lib/orders/status-groups";
import type {
  BadgeKind as DbBadge,
  Fulfilment as DbFulfilment,
  PricingUnit as DbPricingUnit,
} from "@prisma/client";

/**
 * Storefront data access.
 *
 * Products, categories and brands are read from Postgres through Prisma —
 * the catalogue that used to live in the separate Django service. Tabs and
 * banners stay as constants below because they are presentation config,
 * not catalogue rows: there is nothing for a merchandiser to edit yet.
 *
 * The accessors keep the shapes their `/api/v1` endpoints will return, so
 * a native client consumes the same contract and no component changes when
 * these become `fetch` calls.
 */
export const TABS: CatalogTab[] = [
  { id: "all", label: "All", icon: "grid" },
  { id: "services", label: "Services", icon: "helmet" },
  { id: "materials", label: "Materials", icon: "bricks" },
  { id: "premium", label: "Architectural Selects", icon: "crown" },
  { id: "interiors", label: "Interiors", icon: "sofa" },
  { id: "lighting", label: "Lighting", icon: "lamp" },
];


/** ---- Mapping ------------------------------------------------------------
 * Prisma spells enums in SCREAMING_SNAKE; the wire contract and the UI use
 * lower snake. Converted in one place so a rename in the schema surfaces
 * here as a type error rather than as a silently mis-rendered chip.
 */

const FULFILMENT: Record<DbFulfilment, FulfilmentType> = {
  INSTANT: "instant",
  SCHEDULED: "scheduled",
  BOOKABLE: "bookable",
  MADE_TO_ORDER: "made_to_order",
};

/** Exported so Studio can price a room's materials from the same
    vocabulary the product pages use, rather than a second copy of it. */
export const PRICING_UNIT: Record<DbPricingUnit, PricingUnit> = {
  PER_PIECE: "per_piece",
  PER_SQFT: "per_sqft",
  PER_RUNNING_FT: "per_running_ft",
  PER_VISIT: "per_visit",
  PER_BAG: "per_bag",
  PER_LITRE: "per_litre",
  PER_KG: "per_kg",
};

const BADGE: Record<DbBadge, BadgeKind> = {
  EXPERTS_VERIFIED: "experts_verified",
  PREMIUM_QUALITY: "premium_quality",
  TOP_BRAND: "top_brand",
  PREMIUM_FINISH: "premium_finish",
  BESTSELLER: "bestseller",
};

/** Only active variants are sellable, cheapest first for "₹X Onwards". */
const VARIANT_QUERY = {
  where: { isActive: true },
  orderBy: { pricePaise: "asc" },
} as const;

/**
 * What makes a product showable at all: switched on, and with something
 * sellable under it. Exported because the admin catalogue register in
 * `src/lib/data/catalog-admin.ts` needs the same rule to label a row as
 * live — restated there, it would be a second definition of "in the shop"
 * free to drift from this one.
 */
export const SELLABLE_PRODUCT = {
  isActive: true,
  variants: { some: { isActive: true } },
} as const;

const PRODUCT_QUERY = {
  where: SELLABLE_PRODUCT,
  include: { brand: true, category: { select: { slug: true } }, variants: VARIANT_QUERY },
} as const;

type ProductRow = Awaited<ReturnType<typeof db.product.findMany<typeof PRODUCT_QUERY>>>[number];
type VariantRow = ProductRow["variants"][number];

function toVariant(row: VariantRow): Variant {
  return {
    id: row.id,
    label: row.label,
    mrp: row.mrpPaise,
    price: row.pricePaise,
    /* `undefined`, not `null`: the storefront type treats an absent Pro
       rate as "Pro pays the standard price", and `null` would not satisfy
       the optional property. */
    proPrice: row.proPricePaise ?? undefined,
    sku: row.sku,
    minQty: row.minQty,
    stepQty: row.stepQty,
  };
}

/**
 * The picture to show for a product row, and the rule about which one.
 *
 * Quoin's own image — photographed or generated — always wins. The
 * captured source photography is the last resort and is gated here rather
 * than in a component: with `SHOW_SOURCE_IMAGES` off, that URL must never
 * reach rendered HTML or an API response at all. Exported so that search
 * suggestions, which select a narrower row, apply the identical gate
 * instead of a second copy of it that can drift.
 */
export function resolvePhoto(row: {
  image: string | null;
  sourceImageUrl: string | null;
}): string | undefined {
  return (
    row.image ||
    (env.SHOW_SOURCE_IMAGES ? (row.sourceImageUrl ?? undefined) : undefined)
  );
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    title: row.name,
    brand: row.brand?.name ?? null,
    /* Imported rows always land in a category — the importer files the
       uncategorised ones explicitly — so the empty string is unreachable
       in practice and exists only to satisfy the non-null contract. */
    categoryId: row.categoryId ?? "",
    fulfilment: FULFILMENT[row.fulfilment],
    pricingUnit: PRICING_UNIT[row.pricingUnit],
    variants: row.variants.map(toVariant),
    badges: row.badges.map((b) => BADGE[b]),
    gstRatePct: row.gstRatePct,
    /* Always a swatch key, never a URL: this is what renders when there
       is no picture at all, and what a failed image load falls back to. */
    image: row.category
      ? (PRODUCT_SWATCH_BY_CATEGORY[row.category.slug] ?? "cement")
      : "cement",
    photo: resolvePhoto(row),
    photoIsIllustration: row.image ? row.imageIsGenerated : false,
    leadTimeDays: row.leadTimeDays ?? undefined,
  };
}

/**
 * Category artwork, until there is any.
 *
 * `Category.images` is empty on every imported row, and a category tile
 * with no thumbnails renders as an empty box. These are swatch keys for
 * `Swatch.tsx`, not URLs — the same stand-in the product grid uses. A
 * category with real images in the column keeps them; this only fills the
 * gap, and the whole map is deleted once photography exists.
 */
const CATEGORY_SWATCHES: Record<string, string[]> = {
  "electricals-lighting": ["switch", "bulb", "pendant"],
  "bathware-plumbing": ["basin", "faucet"],
  "kitchen-wardrobe-fittings": ["steel", "sofa"],
  "kitchen-sinks-faucets": ["faucet", "basin"],
  "tools-safety": ["helmet", "steel"],
  "tiling-adhesives": ["marble", "brick"],
  "home-appliances-security": ["switch", "steel"],
  "paints-finishes": ["paint", "brick"],
  "cement-steel": ["cement", "steel", "brick"],
  "plywood-laminates": ["sofa", "rug"],
  "hardware-locks": ["steel", "switch"],
  waterproofing: ["paint", "cement"],
  "gypsum-false-ceiling": ["cement", "pendant"],
  services: ["helmet"],
};

/**
 * Stand-in artwork per category.
 *
 * Every imported product has an empty `image`, so without this the whole
 * catalogue falls back to one swatch and 883 cards render as the same
 * grey box repeated. Deriving the key from the category at least makes a
 * grid of taps look like taps and a grid of wiring look like wiring.
 *
 * A product with its own `image` always wins; this only fills the gap,
 * and the map goes away when photography lands.
 */
export const PRODUCT_SWATCH_BY_CATEGORY: Record<string, string> = {
  "bathware-plumbing": "basin",
  "kitchen-sinks-faucets": "faucet",
  "electricals-lighting": "bulb",
  "home-appliances-security": "switch",
  "hardware-locks": "steel",
  "kitchen-wardrobe-fittings": "steel",
  "tools-safety": "helmet",
  "tiling-adhesives": "marble",
  "paints-finishes": "paint",
  "cement-steel": "cement",
  "plywood-laminates": "sofa",
  "waterproofing": "paint",
  "gypsum-false-ceiling": "pendant",
  services: "helmet",
};

/** ---- Accessors ---------------------------------------------------------- */

export async function getTabs(): Promise<CatalogTab[]> {
  return TABS;
}

/** Top-level categories only; children render inside a category page. */
export async function getCategories(): Promise<Category[]> {
  const rows = await db.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { children: true, products: true } } },
  });

  return rows.map((row) => {
    const images = row.images.length ? row.images : (CATEGORY_SWATCHES[row.slug] ?? []);
    return {
      id: row.id,
      slug: row.slug,
      title: row.name,
      images,
      /* The tile shows the thumbnails above; "+N more" counts the
         sub-categories beyond them. The import creates a flat list, so
         this is zero until the tree is populated, and the tile falls back
         to the product count. */
      moreCount: Math.max(0, row._count.children - images.length),
      productCount: row._count.products,
    };
  });
}

/**
 * Top Picks becomes personalised server-side once there is behaviour to
 * personalise on. Until then it is the newest active catalogue, capped so
 * the home page never renders the whole 800-row import.
 */
const TOP_PICKS = 12;

/* Several candidates per category rather than one, so a category whose
   newest product repeats a photograph already on the row has something
   else to offer instead of dropping off it. */
const TOP_PICK_POOL = 4;

export async function getTopPicks(): Promise<Product[]> {
  /* Photographed products only — not illustrated ones, and not the swatch
     fallback. A featured row is a recommendation, the picture is what does
     the recommending, so it has to be the actual goods.

     `NOT: { image: "" }` drops anything with no Quoin image at all, which
     also excludes rows whose only picture is the quarantined
     `sourceImageUrl`. `imageIsGenerated: false` drops the illustrated
     ones: they are labelled honestly on a card someone went looking for,
     but they should not be what the storefront leads with. */
  /* One query, not one per category.
     The pool was built by fanning out a findMany per category and awaiting
     them together. Fourteen categories means fourteen connections asked
     for at once, and against a pooled Postgres that is enough to exhaust
     Prisma's own pool and time the page out — which is how the home page
     started returning 500 in production. A window function picks the same
     rows server-side and asks for one connection. */
  const ranked = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM (
      SELECT p.id,
             ROW_NUMBER() OVER (
               PARTITION BY p."categoryId" ORDER BY p."createdAt" DESC
             ) AS rank
      FROM products p
      WHERE p."isActive"
        AND p.image <> ''
        AND NOT p."imageIsGenerated"
        AND EXISTS (
          SELECT 1 FROM product_variants v
          WHERE v."productId" = p.id AND v."isActive"
        )
    ) ranked
    WHERE rank <= ${TOP_PICK_POOL}
  `;

  const pools = ranked.length
    ? [
        await db.product.findMany({
          ...PRODUCT_QUERY,
          where: { ...PRODUCT_QUERY.where, id: { in: ranked.map((r) => r.id) } },
        }),
      ]
    : [];

  /* Newest first across the whole catalogue, then take the first product
     that brings both a category and a photograph the row does not have.

     Both caps are needed, and neither implies the other. Ordering by date
     alone gave a row of ten Artificial Marble Ledge variants, because a
     single import is a single day: the category cap fixes that. And that
     family shares one photograph between several sizes, so a row could
     still repeat a picture across two categories: the image cap fixes
     that. Skipping a candidate does not spend its category — the next
     product from it is still eligible further down the list. */
  const candidates = pools
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const picks: ProductRow[] = [];
  const seenCategories = new Set<string>();
  const seenImages = new Set<string>();

  for (const row of candidates) {
    if (picks.length === TOP_PICKS) break;
    const category = row.categoryId ?? "";
    if (seenCategories.has(category) || seenImages.has(row.image)) continue;
    seenCategories.add(category);
    seenImages.add(row.image);
    picks.push(row);
  }

  /* No swatch filler behind these. If there is not enough photography the
     section comes back short, or empty, rather than padded with pictures
     that are not of the product. */
  return picks.map(toProduct);
}

/**
 * What customers have actually ordered, most first.
 *
 * Ranked by units sold across orders where money moved — a cart somebody
 * abandoned at the payment sheet is not evidence of anything, and
 * counting it would let a basket nobody paid for decide what the home
 * page leads with.
 *
 * ## This is a real count, not a curated row
 *
 * There is no `bestseller` flag and nothing here is hand-picked. The
 * ranking is `SUM(qty)` grouped by `OrderLine.productSlug`, which is the
 * column `createPendingOrder` froze at checkout precisely so an order can
 * still be read after the catalogue moved on.
 *
 * It follows that **the row is only as good as the order history**. On a
 * catalogue that has taken a handful of orders it will come back with a
 * handful of products, and `hasEnough` drops the section rather than
 * padding it out with things nobody bought. That is the honest failure:
 * a "bestsellers" row filled from the catalogue is a lie about the one
 * thing it claims to measure.
 *
 * Photographed products only, for the reason `getTopPicks` gives — a
 * recommendation row is sold by its pictures.
 */
export async function getBestsellers(limit = 10): Promise<Product[]> {
  /* Grouped in Postgres rather than by pulling every line into Node: the
     line table grows with sales and this runs on the home page. */
  const ranked = await db.$queryRaw<{ productSlug: string }[]>`
    SELECT l."productSlug"
    FROM order_lines l
    JOIN orders o ON o.id = l."orderId"
    WHERE o.status = ANY(${MONEY_MOVED_STATUSES}::text[]::"OrderStatus"[])
    GROUP BY l."productSlug"
    ORDER BY SUM(l.qty) DESC, COUNT(*) DESC
    LIMIT ${limit * 3}
  `;

  if (ranked.length === 0) return [];

  const slugs = ranked.map((r) => r.productSlug);
  const rows = await db.product.findMany({
    ...PRODUCT_QUERY,
    where: {
      ...PRODUCT_QUERY.where,
      slug: { in: slugs },
      image: { not: "" },
      imageIsGenerated: false,
    },
  });

  /* Postgres returned the products in whatever order it liked; the order
     that matters is the one the ranking above produced. */
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((row): row is (typeof rows)[number] => row != null)
    .slice(0, limit)
    .map(toProduct);
}

/**
 * The first few products of several departments, in one query.
 *
 * The home page carries a shelf per department, and the obvious
 * implementation — `listProducts({ categorySlug })` once per rail — is
 * the exact fan-out that took the home page down before. `getTopPicks`
 * carries the full note: a `findMany` per category means that many
 * connections asked for at once, and against a pooled Postgres eight of
 * them is enough to exhaust Prisma's pool and time the page out.
 *
 * So the same shape as that fix. A window function ranks each
 * department's products server-side and one `findMany` hydrates the
 * winners, which is two connections however many rails the page grows.
 *
 * Ordered by name rather than date: a department's newest products are
 * whatever the last import happened to contain, which puts one supplier's
 * batch at the front of a shelf that is meant to show the department.
 *
 * Returned keyed by slug, and a department with nothing sellable is
 * simply absent rather than present-and-empty — the caller drops a rail
 * on `hasEnough` either way.
 */
export async function listRailProducts(
  slugs: readonly string[],
  perCategory = 12,
): Promise<Map<string, Product[]>> {
  if (slugs.length === 0) return new Map();

  const ranked = await db.$queryRaw<{ id: string; slug: string }[]>`
    SELECT id, slug FROM (
      SELECT p.id AS id,
             c.slug AS slug,
             ROW_NUMBER() OVER (
               PARTITION BY p."categoryId" ORDER BY p.name ASC
             ) AS rank
      FROM products p
      JOIN categories c ON c.id = p."categoryId"
      WHERE p."isActive"
        AND c.slug = ANY(${[...slugs]}::text[])
        AND EXISTS (
          SELECT 1 FROM product_variants v
          WHERE v."productId" = p.id AND v."isActive"
        )
    ) ranked
    WHERE rank <= ${perCategory}
  `;

  if (ranked.length === 0) return new Map();

  const rows = await db.product.findMany({
    ...PRODUCT_QUERY,
    where: { ...PRODUCT_QUERY.where, id: { in: ranked.map((r) => r.id) } },
  });

  /* Postgres returned the rows in its own order; the order that matters
     is the ranking above, which is what each shelf is sorted by. */
  const byId = new Map(rows.map((row) => [row.id, row]));
  const out = new Map<string, Product[]>();
  for (const { id, slug } of ranked) {
    const row = byId.get(id);
    if (!row) continue;
    const list = out.get(slug) ?? [];
    list.push(toProduct(row));
    out.set(slug, list);
  }
  return out;
}

/** Null rather than throwing — the route turns a miss into a 404. */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const row = await db.product.findFirst({
    ...PRODUCT_QUERY,
    where: { ...PRODUCT_QUERY.where, slug },
  });
  return row ? toProduct(row) : null;
}

/**
 * Several products at once, by slug.
 *
 * One query for a list that would otherwise be one `getProductBySlug` per
 * row — a room with eighteen materials is eighteen round trips answered
 * by the same index. Returned in no particular order; callers that care
 * about order build their own map, because the order they want is the
 * order *they* wrote, not the one Postgres returned.
 *
 * Slugs that do not resolve are simply absent. A retired SKU is ordinary,
 * and the alternative — throwing, or returning a null in the middle of
 * the array — pushes that handling into every caller.
 */
export async function listProductsBySlugs(slugs: string[]): Promise<Product[]> {
  if (slugs.length === 0) return [];
  const rows = await db.product.findMany({
    ...PRODUCT_QUERY,
    where: { ...PRODUCT_QUERY.where, slug: { in: [...new Set(slugs)] } },
  });
  return rows.map(toProduct);
}

/** Cheap cross-sell: same category, excluding the product being viewed. */
export async function getRelatedProducts(product: Product): Promise<Product[]> {
  if (!product.categoryId) return [];

  const rows = await db.product.findMany({
    ...PRODUCT_QUERY,
    where: {
      ...PRODUCT_QUERY.where,
      categoryId: product.categoryId,
      id: { not: product.id },
    },
    take: 8,
  });
  return rows.map(toProduct);
}

/** ---- Browse -------------------------------------------------------------
 * Backs `GET /api/v1/products`. The filters, the search fields and the
 * three sort orders are the ones the removed Django viewset defined; they
 * are reproduced here so a client written against that API keeps working.
 */

export type ProductSort = "name" | "newest" | "price";

export interface ProductQuery {
  categorySlug?: string;
  brandSlug?: string;
  fulfilment?: FulfilmentType;
  /** The phone chip row's "Size" facet — how the price is expressed. */
  pricingUnit?: PricingUnit;
  /** Matched against product name, SKU, brand name and category name. */
  search?: string;
  /** Inclusive bounds on the cheapest sellable variant, in paise. */
  minPricePaise?: number;
  maxPricePaise?: number;
  /** Only products with a live variant priced under its own MRP. */
  discountedOnly?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

export interface ProductPage {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Django's `PAGE_SIZE`. Kept so paging behaves identically. */
export const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

const DB_FULFILMENT: Record<FulfilmentType, DbFulfilment> = {
  instant: "INSTANT",
  scheduled: "SCHEDULED",
  bookable: "BOOKABLE",
  made_to_order: "MADE_TO_ORDER",
};

const DB_PRICING_UNIT: Record<PricingUnit, DbPricingUnit> = {
  per_piece: "PER_PIECE",
  per_sqft: "PER_SQFT",
  per_running_ft: "PER_RUNNING_FT",
  per_visit: "PER_VISIT",
  per_bag: "PER_BAG",
  per_litre: "PER_LITRE",
  per_kg: "PER_KG",
};

/**
 * One definition of what a query matches.
 *
 * Shared by the listing, its count, the price-ordered path and the facet
 * counts, so a filter can never apply to one and not another — which is
 * exactly how a "24 results" heading ends up over a grid of 31.
 *
 * The variant condition is composed rather than spread over: the base
 * query already requires `variants: { some: { isActive: true } }`, and a
 * price bound written as a second `variants` key would silently replace
 * that and start returning products with no sellable variant at all.
 */
function productWhere(query: ProductQuery) {
  const search = query.search?.trim();
  const { minPricePaise: min, maxPricePaise: max } = query;
  const bounded = min != null || max != null;

  return {
    isActive: true,
    variants: {
      some: {
        isActive: true,
        ...(bounded
          ? {
              pricePaise: {
                ...(min != null ? { gte: min } : {}),
                ...(max != null ? { lte: max } : {}),
              },
            }
          : {}),
      },
    },
    ...(query.categorySlug ? { category: { slug: query.categorySlug } } : {}),
    ...(query.brandSlug ? { brand: { slug: query.brandSlug } } : {}),
    ...(query.fulfilment ? { fulfilment: DB_FULFILMENT[query.fulfilment] } : {}),
    ...(query.pricingUnit ? { pricingUnit: DB_PRICING_UNIT[query.pricingUnit] } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { sku: { contains: search, mode: "insensitive" as const } },
            { brand: { name: { contains: search, mode: "insensitive" as const } } },
            { category: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export async function listProducts(query: ProductQuery = {}): Promise<ProductPage> {
  const pageSize = Math.min(Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const page = Math.max(1, query.page ?? 1);
  const skip = (page - 1) * pageSize;

  /* The single source of truth for what matches. Both the count and the
     price-ordered path below derive from this object rather than
     restating the conditions, so a filter can never apply to one and not
     the other. */
  const where = query.discountedOnly
    ? {
        ...productWhere(query),
        /* Prisma cannot compare two columns of the same row in a `where`,
           so "priced under its own MRP" is resolved in SQL and folded back
           in as an id set. Narrowing rather than replacing the filter
           keeps one definition of what matches. */
        id: { in: await discountedProductIds() },
      }
    : productWhere(query);

  const total = await db.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows =
    query.sort === "price"
      ? await byCheapestVariant(where, skip, pageSize)
      : await db.product.findMany({
          ...PRODUCT_QUERY,
          where,
          orderBy: query.sort === "newest" ? { createdAt: "desc" } : { name: "asc" },
          skip,
          take: pageSize,
        });

  return { items: rows.map(toProduct), page, pageSize, total, totalPages };
}

/**
 * Ordering by a product's cheapest variant.
 *
 * Prisma cannot order by an aggregate over a relation, so the ordering is
 * done in SQL. Only the ordering is: the matching ids come from the Prisma
 * filter above, and this query sorts and pages within them. That keeps one
 * definition of what matches, at the cost of sending the matching id set
 * to the database. Fine at catalogue sizes in the low thousands; past that
 * this needs a maintained cheapest-price column to sort on directly.
 */
async function byCheapestVariant(
  where: Prisma.ProductWhereInput,
  skip: number,
  take: number,
): Promise<ProductRow[]> {
  const matching = await db.product.findMany({ where, select: { id: true } });
  if (matching.length === 0) return [];

  const ordered = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM products p
    JOIN LATERAL (
      SELECT MIN(v."pricePaise") AS cheapest
      FROM product_variants v
      WHERE v."productId" = p.id AND v."isActive"
    ) v ON TRUE
    WHERE p.id IN (${Prisma.join(matching.map((m) => m.id))})
    ORDER BY v.cheapest ASC, p.name ASC
    LIMIT ${take} OFFSET ${skip}
  `;

  const rows = await db.product.findMany({
    ...PRODUCT_QUERY,
    where: { id: { in: ordered.map((o) => o.id) } },
  });

  /* `IN` does not preserve order, so restore the one SQL decided. */
  const bySlot = new Map(rows.map((row) => [row.id, row]));
  return ordered.flatMap((o) => bySlot.get(o.id) ?? []);
}

/**
 * The filter panel's options, counted against the current query.
 *
 * Each facet is counted with its **own** filter removed. Counting brands
 * with the brand filter applied returns one brand with a count equal to
 * the result total, which makes the panel useless — the number next to
 * "Jaquar" has to mean "what you would get if you picked this instead",
 * not "what you already have".
 *
 * Only facets Quoin has data for. The brief also asks for material,
 * finish, size and application; the catalogue has no attribute table, so
 * those filters would be empty controls that never change a result. They
 * arrive when the attributes do.
 */
export interface ProductFacets {
  brands: { slug: string; name: string; count: number }[];
  fulfilments: { id: FulfilmentType; count: number }[];
  /** The phone chip row's "Size" facet. Empty is not an error — a
      category priced entirely `per_piece` has nothing to offer here. */
  pricingUnits: { id: PricingUnit; count: number }[];
  /** Bounds of the cheapest sellable variant across the unpriced query. */
  priceMinPaise: number;
  priceMaxPaise: number;
  discountedCount: number;
}

export async function getProductFacets(
  query: ProductQuery = {},
): Promise<ProductFacets> {
  /* Every facet drops its own dimension, and the price bounds drop the
     price filter, so the slider always spans the full range of what is
     otherwise selected rather than collapsing onto itself. */
  const withoutBrand = productWhere({ ...query, brandSlug: undefined });
  const withoutFulfilment = productWhere({ ...query, fulfilment: undefined });
  const withoutPricingUnit = productWhere({ ...query, pricingUnit: undefined });
  const withoutPrice = productWhere({
    ...query,
    minPricePaise: undefined,
    maxPricePaise: undefined,
  });

  const [brandRows, fulfilmentRows, pricingUnitRows, bounds, discountedIds] = await Promise.all([
    db.product.groupBy({
      by: ["brandId"],
      where: { ...withoutBrand, brandId: { not: null } },
      _count: { _all: true },
    }),
    db.product.groupBy({
      by: ["fulfilment"],
      where: withoutFulfilment,
      _count: { _all: true },
    }),
    db.product.groupBy({
      by: ["pricingUnit"],
      where: withoutPricingUnit,
      _count: { _all: true },
    }),
    db.productVariant.aggregate({
      where: { isActive: true, product: withoutPrice },
      _min: { pricePaise: true },
      _max: { pricePaise: true },
    }),
    discountedProductIds(),
  ]);

  /* `groupBy` returns ids; the names come back in one further query
     rather than one per brand. */
  const brandIds = brandRows.map((r) => r.brandId).filter((id): id is string => id != null);
  const brandNames = await db.brand.findMany({
    where: { id: { in: brandIds } },
    select: { id: true, slug: true, name: true },
  });
  const byId = new Map(brandNames.map((b) => [b.id, b]));

  const discountedCount = await db.product.count({
    where: { ...productWhere(query), id: { in: discountedIds } },
  });

  return {
    brands: brandRows
      .flatMap((row) => {
        const brand = row.brandId ? byId.get(row.brandId) : undefined;
        if (!brand) return [];
        return { slug: brand.slug, name: brand.name, count: row._count._all };
      })
      /* Most stocked first: a filter list ordered alphabetically buries
         the brand that actually has the range behind twenty that have
         three products each. */
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),

    fulfilments: fulfilmentRows.map((row) => ({
      id: FULFILMENT[row.fulfilment],
      count: row._count._all,
    })),

    pricingUnits: pricingUnitRows.map((row) => ({
      id: PRICING_UNIT[row.pricingUnit],
      count: row._count._all,
    })),

    priceMinPaise: bounds._min.pricePaise ?? 0,
    priceMaxPaise: bounds._max.pricePaise ?? 0,
    discountedCount,
  };
}

/** Brands that have something to sell, for the filter rail. */
export async function listBrands(): Promise<{ id: string; slug: string; name: string }[]> {
  const rows = await db.brand.findMany({
    where: { isActive: true, products: { some: PRODUCT_QUERY.where } },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
  return rows;
}

/**
 * Names the catalogue carries but no manufacturer answers for.
 *
 * The source export always writes something in the brand column, so
 * unbranded rows arrive as `Generic`, `Local` or `India`.
 *
 * `homerun` is kept on the list although no product carries it any more —
 * `scripts/rebrand-scraped.ts` moved that stock onto the house brand and
 * onto the manufacturers that actually made it. The entry stays because a
 * re-run of the original import would put the merchant's name back, and a
 * competitor's name on the partner shelf is not a thing to rediscover in
 * production. A denylist rather than an allowlist: a real brand arriving
 * with the next import should appear without a code change, and the long
 * tail of one-off oddities never ranks high enough to show.
 */
const NON_BRANDS = new Set(["generic", "local", "india", "homerun"]);

/** Case- and punctuation-insensitive, so `Dr Fixit` and `Dr. Fixit` collide. */
function brandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Where each brand on the wall should link, keyed by normalised name.
 *
 * The wall itself is a hand-kept roster (`BRAND_WALL`) — it says who we
 * buy from, which is a claim the catalogue cannot make on its own. But a
 * logo that leads to an empty shelf is worse than a logo that leads
 * nowhere, so the link is resolved here: a plate becomes a link only if
 * that manufacturer currently has something sellable.
 *
 * Keyed by `brandKey` rather than by slug because the roster spells names
 * the way the manufacturer does and the importer spells them the way the
 * source sheet did. The importer has also left near-duplicate rows behind
 * (`MYK Laticrete` and `Myk Laticrete` are one company), so entries that
 * normalise together are folded and the fuller of the two wins the link —
 * the counts are deliberately not summed, since the link can only lead to
 * one of them.
 */
export async function getBrandLinkTargets(): Promise<Map<string, string>> {
  const rows = await db.brand.findMany({
    where: { isActive: true, products: { some: PRODUCT_QUERY.where } },
    select: {
      slug: true,
      name: true,
      _count: { select: { products: { where: PRODUCT_QUERY.where } } },
    },
  });

  const best = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = brandKey(row.name);
    if (NON_BRANDS.has(key)) continue;
    const held = best.get(key);
    if (!held || held._count.products < row._count.products) best.set(key, row);
  }

  return new Map([...best].map(([key, row]) => [key, row.slug]));
}

/** Shared with the brand wall, which normalises its roster the same way. */
export { brandKey };

/** One category by slug, for the category browse page. Null becomes a 404. */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const row = await db.category.findFirst({
    where: { slug, isActive: true },
    include: { _count: { select: { children: true, products: true } } },
  });
  if (!row) return null;

  const images = row.images.length ? row.images : (CATEGORY_SWATCHES[row.slug] ?? []);
  return {
    id: row.id,
    slug: row.slug,
    title: row.name,
    images,
    moreCount: Math.max(0, row._count.children - images.length),
    productCount: row._count.products,
  };
}

/**
 * The cheapest thing a department's pill is allowed to quote.
 *
 * A plain `MIN` over every sellable variant is arithmetically right and
 * tells the reader something false. Fourteen departments were being
 * priced by their smallest accessory: *Hardware & locks* said **From ₹1**
 * (a mis-filed gypsum keel), *Electricals & lighting* **From ₹3** (a
 * conduit collar), *Kitchen & wardrobe fittings* **From ₹3** (a shelf
 * support pin), *Bathware & plumbing* **From ₹4** (a saddle clamp).
 *
 * Every one of those is a real price on a real row. None of them is what
 * "From ₹3" leads somebody to expect of a lighting department, and a
 * figure that collapses on contact is worse for trust than no figure —
 * it reads as a broken price even when it is not.
 *
 * ₹25 is set where it is because of what the catalogue actually holds:
 * exactly fourteen variants sit under ₹10 and all fourteen are fittings
 * — collars, pins, clamps, thimbles, a putty blade — while the cheapest
 * thing anyone browses a department *for* starts well above it. It is a
 * threshold on what may be **quoted**, not on what may be sold: the
 * clamps are still in the catalogue, still searchable and still
 * buyable. Only the headline changes.
 */
const MIN_QUOTABLE_FLOOR_PAISE = 2500;

/**
 * Cheapest sellable price per category, for the "From ₹49" pills.
 *
 * One grouped query rather than a cheapest-product lookup per tile: the
 * home page renders every top-level category, so the per-tile version is
 * fourteen round trips to Singapore before the page can paint.
 *
 * A department whose every variant is under the threshold returns no row
 * and therefore no pill, which is the right outcome: a department of
 * nothing but fittings has no meaningful "from" price to give.
 */
export async function getCategoryPriceFloors(): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ categoryId: string; floor: number }[]>`
    SELECT p."categoryId" AS "categoryId", MIN(v."pricePaise")::int AS floor
    FROM products p
    JOIN product_variants v ON v."productId" = p.id AND v."isActive"
    WHERE p."isActive"
      AND p."categoryId" IS NOT NULL
      AND v."pricePaise" >= ${MIN_QUOTABLE_FLOOR_PAISE}
    GROUP BY p."categoryId"
  `;
  return new Map(rows.map((r) => [r.categoryId, r.floor]));
}

/** ---- Merchandising -------------------------------------------------------
 * Products that exist but cannot be sold. A catalogue import brings in a
 * name, a photograph and a manufacturer code; the price is a decision
 * nobody but a merchandiser can make, so those rows arrive without a
 * variant and stay out of the storefront until one is added.
 */

export interface UnpricedProduct {
  id: string;
  sku: string;
  title: string;
  brand: string | null;
  category: string | null;
  photo?: string;
  image: string;
}

export async function listUnpricedProducts(
  page = 1,
  pageSize = 24,
): Promise<{ items: UnpricedProduct[]; total: number; totalPages: number }> {
  const where = { isActive: true, variants: { none: {} } };

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: { brand: true, category: { select: { name: true, slug: true } } },
      orderBy: { name: "asc" },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      title: row.name,
      brand: row.brand?.name ?? null,
      category: row.category?.name ?? null,
      photo: row.image || undefined,
      image: row.category
        ? (PRODUCT_SWATCH_BY_CATEGORY[row.category.slug] ?? "cement")
        : "cement",
    })),
  };
}

/**
 * Products with no photograph of their own.
 *
 * The swatch stands in for these on the storefront, which is honest but
 * plain. Filterable by brand because the person pairing them can tell a
 * Häfele bracket from a Jaquar tap on sight, and mixing brands into one
 * list makes that harder rather than easier.
 */
export async function listProductsWithoutPhoto(
  page = 1,
  pageSize = 12,
  brandSlug?: string,
): Promise<{ items: UnpricedProduct[]; total: number; totalPages: number }> {
  const where = {
    isActive: true,
    image: "",
    ...(brandSlug ? { brand: { slug: brandSlug } } : {}),
  };

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: { brand: true, category: { select: { name: true, slug: true } } },
      orderBy: { name: "asc" },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      title: row.name,
      brand: row.brand?.name ?? null,
      category: row.category?.name ?? null,
      photo: undefined,
      image: row.category
        ? (PRODUCT_SWATCH_BY_CATEGORY[row.category.slug] ?? "cement")
        : "cement",
    })),
  };
}

/** Brands that still have products without a photograph, for the filter. */
export async function listBrandsMissingPhotos(): Promise<
  { slug: string; name: string; missing: number }[]
> {
  const rows = await db.brand.findMany({
    where: { products: { some: { isActive: true, image: "" } } },
    select: {
      slug: true,
      name: true,
      _count: { select: { products: { where: { isActive: true, image: "" } } } },
    },
    orderBy: { name: "asc" },
  });

  return rows
    .map((r) => ({ slug: r.slug, name: r.name, missing: r._count.products }))
    .sort((a, b) => b.missing - a.missing);
}

/**
 * Ids of every product with a live variant priced under its own MRP.
 *
 * Extracted so the Deals page and the `?offers=1` filter on any listing
 * agree about what a discount is. A product that appears on one and not
 * the other is a support ticket about a saving that vanished.
 */
async function discountedProductIds(): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT p.id
    FROM products p
    JOIN product_variants v ON v."productId" = p.id
    WHERE p."isActive" AND v."isActive" AND v."pricePaise" < v."mrpPaise"
  `;
  return rows.map((r) => r.id);
}

/**
 * Products selling below their list price.
 *
 * A discount is the gap between MRP and sell price on a live variant, not
 * a flag someone sets — so nothing can appear here advertising a saving a
 * customer would not get at checkout. Prisma cannot compare two columns
 * of the same row in a `where`, so the comparison is done in SQL and the
 * ids come back to the same include the rest of the storefront uses.
 */
export async function listDiscountedProducts(
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<ProductPage> {
  const ids = await discountedProductIds();
  const total = ids.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) return { items: [], page, pageSize, total, totalPages };

  const slice = ids.slice((Math.max(1, page) - 1) * pageSize, Math.max(1, page) * pageSize);
  const products = await db.product.findMany({
    ...PRODUCT_QUERY,
    where: { ...PRODUCT_QUERY.where, id: { in: slice } },
    orderBy: { name: "asc" },
  });

  return { items: products.map(toProduct), page, pageSize, total, totalPages };
}
