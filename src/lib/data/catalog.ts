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
  { id: "premium", label: "Premium Products", icon: "crown" },
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

const PRICING_UNIT: Record<DbPricingUnit, PricingUnit> = {
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

const PRODUCT_QUERY = {
  where: { isActive: true, variants: { some: { isActive: true } } },
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
    /* Always a swatch key, never a URL: this is what renders when there
       is no picture at all, and what a failed image load falls back to. */
    image: row.category
      ? (PRODUCT_SWATCH_BY_CATEGORY[row.category.slug] ?? "cement")
      : "cement",
    /* Quoin's own image — photographed or generated — always wins. The
       captured source photography is the last resort, and gated at the
       mapper rather than in the component: with the flag off that URL
       never reaches the rendered HTML or an API response at all. */
    photo:
      row.image ||
      (env.SHOW_SOURCE_IMAGES ? (row.sourceImageUrl ?? undefined) : undefined),
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
const PRODUCT_SWATCH_BY_CATEGORY: Record<string, string> = {
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
export async function getTopPicks(): Promise<Product[]> {
  const rows = await db.product.findMany({
    ...PRODUCT_QUERY,
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return rows.map(toProduct);
}

/** Null rather than throwing — the route turns a miss into a 404. */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const row = await db.product.findFirst({
    ...PRODUCT_QUERY,
    where: { ...PRODUCT_QUERY.where, slug },
  });
  return row ? toProduct(row) : null;
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
  /** Matched against product name, SKU, brand name and category name. */
  search?: string;
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

export async function listProducts(query: ProductQuery = {}): Promise<ProductPage> {
  const pageSize = Math.min(Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const page = Math.max(1, query.page ?? 1);
  const skip = (page - 1) * pageSize;

  const search = query.search?.trim();

  /* The single source of truth for what matches. Both the count and the
     price-ordered path below derive from this object rather than
     restating the conditions, so a filter can never apply to one and not
     the other. */
  const where = {
    ...PRODUCT_QUERY.where,
    ...(query.categorySlug ? { category: { slug: query.categorySlug } } : {}),
    ...(query.brandSlug ? { brand: { slug: query.brandSlug } } : {}),
    ...(query.fulfilment ? { fulfilment: DB_FULFILMENT[query.fulfilment] } : {}),
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
  where: typeof PRODUCT_QUERY.where,
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
 * unbranded rows arrive as `Generic`, `Local` or `India`, and the rows
 * scraped from the merchant that seeded the catalogue arrive as
 * `HomeRun` — a competitor, and the last name that belongs on a shelf of
 * partners. A denylist rather than an allowlist: a real brand that
 * arrives with the next import should appear without a code change, and
 * the long tail of one-off oddities never ranks high enough to show.
 */
const NON_BRANDS = new Set(["generic", "local", "india", "homerun"]);

/** Case- and punctuation-insensitive, so `Dr Fixit` and `Dr. Fixit` collide. */
function brandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The brands worth naming on the home page, deepest catalogue first.
 *
 * Ranked by how much of each brand is actually sellable rather than by a
 * hand-kept list, so the row can never advertise a partner whose products
 * have all gone inactive.
 *
 * The importer has left near-duplicate rows behind (`MYK Laticrete` and
 * `Myk Laticrete` are one company), so entries that normalise to the same
 * name are folded together and the fuller of the two wins the link — the
 * counts are deliberately not summed, since the link can only lead to one
 * of them.
 */
export async function getFeaturedBrands(limit = 12): Promise<{ id: string; slug: string; name: string }[]> {
  const rows = await db.brand.findMany({
    where: { isActive: true, products: { some: PRODUCT_QUERY.where } },
    select: {
      id: true,
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

  return [...best.values()]
    .sort((a, b) => b._count.products - a._count.products || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ id, slug, name }) => ({ id, slug, name }));
}

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
 * Cheapest sellable price per category, for the "From ₹49" pills.
 *
 * One grouped query rather than a cheapest-product lookup per tile: the
 * home page renders every top-level category, so the per-tile version is
 * fourteen round trips to Singapore before the page can paint.
 */
export async function getCategoryPriceFloors(): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ categoryId: string; floor: number }[]>`
    SELECT p."categoryId" AS "categoryId", MIN(v."pricePaise")::int AS floor
    FROM products p
    JOIN product_variants v ON v."productId" = p.id AND v."isActive"
    WHERE p."isActive" AND p."categoryId" IS NOT NULL
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
