import type {
  Banner,
  CatalogTab,
  Category,
  Product,
} from "@/lib/types/catalog";

/**
 * Fixture data for the storefront.
 *
 * Every export here is shaped exactly like the response its future
 * `/api/v1` endpoint will return, and is reached only through the async
 * accessors at the bottom of this file. When the real backend lands,
 * those four functions become `fetch` calls and no component changes.
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

export const CATEGORIES: Category[] = [
  {
    id: "c_construction",
    slug: "construction-materials",
    title: "Construction Materials",
    images: ["cement", "steel", "brick"],
    moreCount: 6,
  },
  {
    id: "c_electrical",
    slug: "electrical-lighting",
    title: "Electrical & Lighting Supplies",
    images: ["switch", "bulb"],
    moreCount: 5,
  },
  {
    id: "c_bathware",
    slug: "bathware-plumbing",
    title: "Bathware & Plumbing",
    images: ["basin", "faucet"],
    moreCount: 4,
  },
  {
    id: "c_interiors",
    slug: "interiors-furnishing",
    title: "Interiors & Furnishing",
    images: ["sofa", "rug"],
    moreCount: 8,
  },
];

/**
 * Note the deliberate spread of `fulfilment` values — these four products
 * exercise every checkout path the cart has to handle, which is why they
 * are the fixtures rather than four convenient in-stock SKUs.
 */
export const PRODUCTS: Product[] = [
  {
    id: "p_sitevisit",
    slug: "site-visit-inspection",
    title: "Site Visit & Inspection",
    brand: null,
    categoryId: "c_services",
    fulfilment: "bookable",
    pricingUnit: "per_visit",
    badges: ["experts_verified"],
    image: "helmet",
    variants: [
      {
        id: "v_sitevisit_std",
        label: "Standard visit",
        mrp: 24900,
        price: 14900,
        proPrice: 9900,
        sku: "SVC-SV-STD",
        minQty: 1,
        stepQty: 1,
      },
    ],
  },
  {
    id: "p_statuario",
    slug: "italian-marble-statuario",
    title: "Italian Marble Statuario",
    brand: "Quoin Select",
    categoryId: "c_construction",
    fulfilment: "made_to_order",
    pricingUnit: "per_sqft",
    badges: ["premium_quality"],
    image: "marble",
    leadTimeDays: 7,
    variants: [
      {
        id: "v_statuario_16",
        label: "16mm slab",
        mrp: 18900,
        price: 14900,
        proPrice: 13400,
        sku: "MAT-MRB-ST16",
        /* Sold by the slab, not the square foot — a 20 sq.ft. minimum
           prevents orders that cannot physically be cut. */
        minQty: 20,
        stepQty: 5,
      },
      {
        id: "v_statuario_20",
        label: "20mm slab",
        mrp: 22900,
        price: 18900,
        proPrice: 17000,
        sku: "MAT-MRB-ST20",
        minQty: 20,
        stepQty: 5,
      },
    ],
  },
  {
    id: "p_royale",
    slug: "asian-paints-royale-luxury-emulsion",
    title: "Asian Paints Royale Luxury Emulsion",
    brand: "Asian Paints",
    categoryId: "c_construction",
    fulfilment: "instant",
    pricingUnit: "per_litre",
    badges: ["top_brand"],
    image: "paint",
    variants: [
      {
        id: "v_royale_1l",
        label: "1 L",
        mrp: 19900,
        price: 15500,
        sku: "PNT-RYL-1L",
        minQty: 1,
        stepQty: 1,
      },
      {
        id: "v_royale_4l",
        label: "4 L",
        mrp: 72900,
        price: 58900,
        proPrice: 54900,
        sku: "PNT-RYL-4L",
        minQty: 1,
        stepQty: 1,
      },
      {
        id: "v_royale_10l",
        label: "10 L",
        mrp: 169900,
        price: 139900,
        proPrice: 129900,
        sku: "PNT-RYL-10L",
        minQty: 1,
        stepQty: 1,
      },
    ],
  },
  {
    id: "p_pendant",
    slug: "designer-pendant-light",
    title: "Designer Pendant Light",
    brand: "Quoin Studio",
    categoryId: "c_electrical",
    fulfilment: "instant",
    pricingUnit: "per_piece",
    badges: ["premium_finish"],
    image: "pendant",
    variants: [
      {
        id: "v_pendant_black",
        label: "Matte black / brass",
        mrp: 24900,
        price: 14900,
        proPrice: 12900,
        sku: "LGT-PND-BLK",
        minQty: 1,
        stepQty: 1,
      },
    ],
  },
];

/** ---- Accessors ---------------------------------------------------------
 * Async by design even though the data is local. Components that await
 * these today will keep working unchanged once they hit the network.
 */

export async function getTabs(): Promise<CatalogTab[]> {
  return TABS;
}

export async function getBanners(): Promise<Banner[]> {
  return BANNERS;
}

export async function getCategories(): Promise<Category[]> {
  return CATEGORIES;
}

/** Top Picks is personalised server-side; the fixture returns everything. */
export async function getTopPicks(): Promise<Product[]> {
  return PRODUCTS;
}

/** Null rather than throwing — the route turns a miss into a 404. */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  return PRODUCTS.find((p) => p.slug === slug) ?? null;
}

/** Cheap cross-sell: same category, excluding the product being viewed. */
export async function getRelatedProducts(product: Product): Promise<Product[]> {
  return PRODUCTS.filter(
    (p) => p.id !== product.id && p.categoryId === product.categoryId,
  );
}

export async function getAllProductSlugs(): Promise<string[]> {
  return PRODUCTS.map((p) => p.slug);
}
