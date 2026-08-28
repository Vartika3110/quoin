import type {
  Banner,
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

export const BANNERS: Banner[] = [
  {
    id: "b_sourcing",
    eyebrow: "Featured",
    title: "Sourcing Solutions",
    subtitle: "For Every Space",
    href: "/collections/sourcing",
    tone: "from-neutral-700 via-neutral-800 to-black",
  },
  {
    id: "b_arrivals",
    eyebrow: "Featured",
    title: "New Arrivals",
    subtitle: "Premium Materials & Products",
    href: "/collections/new",
    tone: "from-stone-600 via-stone-800 to-black",
  },
  {
    id: "b_consult",
    eyebrow: "Featured",
    title: "Expert Consultation",
    subtitle: "Design. Plan. Build Better.",
    href: "/consult",
    tone: "from-slate-700 via-slate-900 to-black",
  },
  {
    id: "b_bespoke",
    eyebrow: "Featured",
    title: "Bespoke Living",
    subtitle: "Curated for Your Space",
    href: "/collections/bespoke",
    tone: "from-amber-800/70 via-neutral-900 to-black",
  },
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
  include: { brand: true, variants: VARIANT_QUERY },
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
    image: row.image,
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

/** ---- Accessors ---------------------------------------------------------- */

export async function getTabs(): Promise<CatalogTab[]> {
  return TABS;
}

export async function getBanners(): Promise<Banner[]> {
  return BANNERS;
}

/** Top-level categories only; children render inside a category page. */
export async function getCategories(): Promise<Category[]> {
  const rows = await db.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { children: true } } },
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
         this is zero until the tree is populated. */
      moreCount: Math.max(0, row._count.children - images.length),
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
