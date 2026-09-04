import { db } from "@/lib/db";
import { resolvePhoto } from "@/lib/data/catalog";

/**
 * Search across everything Quoin holds.
 *
 * Deliberately not one ranked list. A customer typing "bathroom" might
 * want the department, a tap, a brand that makes taps, or someone to come
 * and fit one — and a single blended list makes them read past four
 * products to find the department they meant. Grouping by what the result
 * *is* answers all four questions in one glance, which is the whole point
 * of a command palette over a search box.
 *
 * `LIKE`-based rather than full-text on purpose. Postgres full-text search
 * would rank better, but it needs a maintained `tsvector` column and a
 * migration, and at a catalogue in the low thousands the prefix match is
 * both fast enough and more predictable: someone typing "jaqu" expects
 * Jaquar, and stemming does not help with SKUs and brand names.
 */

export type SuggestionKind = "product" | "category" | "brand" | "destination";

export interface Suggestion {
  kind: SuggestionKind;
  /** Stable across renders, for keyboard navigation. */
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  photo?: string;
}

export interface SearchSuggestions {
  categories: Suggestion[];
  brands: Suggestion[];
  products: Suggestion[];
  destinations: Suggestion[];
  /** Every suggestion in the order they are drawn, for arrow keys. */
  flat: Suggestion[];
}

/**
 * The parts of the app that are not catalogue rows.
 *
 * Matched on their own keywords rather than their titles alone, so
 * "estimate" finds Upload Parcha and "trade" finds Quoin Pro — the words
 * customers use are rarely the words on the tab.
 */
const DESTINATIONS: {
  id: string;
  label: string;
  sublabel: string;
  href: string;
  keywords: string[];
}[] = [
  {
    id: "d-projects",
    label: "Project Hub",
    sublabel: "Track budget, materials and deliveries",
    href: "/projects",
    keywords: ["project", "hub", "budget", "renovation", "site", "track", "plan"],
  },
  {
    id: "d-upload",
    label: "Upload Parcha",
    sublabel: "Turn a materials list into a priced order",
    href: "/upload",
    keywords: ["parcha", "upload", "bill", "list", "estimate", "quote", "boq"],
  },
  {
    id: "d-services",
    label: "Services",
    sublabel: "Architects, contractors, electricians and more",
    href: "/services",
    keywords: [
      "service",
      "architect",
      "designer",
      "contractor",
      "plumber",
      "electrician",
      "painter",
      "installation",
      "labour",
    ],
  },
  {
    id: "d-consult",
    label: "Talk to an expert",
    sublabel: "Book a video consultation",
    href: "/consult",
    keywords: ["consult", "expert", "advice", "video", "call", "help"],
  },
  {
    id: "d-deals",
    label: "Deals",
    sublabel: "Everything currently under list price",
    href: "/deals",
    keywords: ["deal", "offer", "discount", "sale", "cheap", "price drop"],
  },
  {
    id: "d-pro",
    label: "Quoin Pro",
    sublabel: "Trade pricing and priority dispatch",
    href: "/pro",
    keywords: ["pro", "trade", "membership", "bulk", "contractor", "discount"],
  },
  {
    id: "d-orders",
    label: "Orders",
    sublabel: "Everything you have bought",
    href: "/account/orders",
    keywords: ["order", "invoice", "history", "receipt", "delivery", "track"],
  },
  {
    id: "d-wishlist",
    label: "Saved products",
    sublabel: "Your wishlist",
    href: "/account/wishlist",
    keywords: ["wishlist", "saved", "favourite", "heart", "shortlist"],
  },
];

/** Only rows a customer can actually buy — mirrors the catalogue's filter. */
const SELLABLE = {
  isActive: true,
  category: { isActive: true },
  variants: { some: { isActive: true } },
} as const;

export async function suggest(
  term: string,
  limit = 5,
): Promise<SearchSuggestions> {
  const q = term.trim();
  if (q.length < 2) {
    return { categories: [], brands: [], products: [], destinations: [], flat: [] };
  }

  const contains = { contains: q, mode: "insensitive" as const };

  const [categoryRows, brandRows, productRows] = await Promise.all([
    db.category.findMany({
      where: { isActive: true, name: contains },
      select: { id: true, slug: true, name: true, _count: { select: { products: true } } },
      orderBy: { name: "asc" },
      take: limit,
    }),
    db.brand.findMany({
      where: { isActive: true, name: contains, products: { some: SELLABLE } },
      select: { id: true, slug: true, name: true },
      orderBy: { name: "asc" },
      take: limit,
    }),
    db.product.findMany({
      where: {
        ...SELLABLE,
        OR: [{ name: contains }, { sku: contains }, { brand: { name: contains } }],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        sku: true,
        image: true,
        sourceImageUrl: true,
        brand: { select: { name: true } },
      },
      /* Shortest name first: "Tile" before "Tile Adhesive Grey 20kg Bag".
         Prisma cannot order by length, so a modest over-fetch is sorted
         in memory — the exact match a customer typed is almost always the
         shortest row that contains it. */
      take: limit * 4,
    }),
  ]);

  const categories: Suggestion[] = categoryRows.map((c) => ({
    kind: "category",
    id: `c-${c.id}`,
    label: c.name,
    sublabel: `${c._count.products} ${c._count.products === 1 ? "product" : "products"}`,
    href: `/c/${c.slug}`,
  }));

  const brands: Suggestion[] = brandRows.map((b) => ({
    kind: "brand",
    id: `b-${b.id}`,
    label: b.name,
    sublabel: "Brand",
    href: `/products?brand=${b.slug}`,
  }));

  const products: Suggestion[] = productRows
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, limit)
    .map((p) => ({
      kind: "product",
      id: `p-${p.id}`,
      label: p.name,
      sublabel: p.brand?.name ?? p.sku,
      href: `/p/${p.slug}`,
      photo: resolvePhoto(p),
    }));

  const lower = q.toLowerCase();
  const destinations: Suggestion[] = DESTINATIONS.filter(
    (d) =>
      d.label.toLowerCase().includes(lower) ||
      d.keywords.some((k) => k.startsWith(lower) || lower.startsWith(k)),
  )
    .slice(0, 3)
    .map((d) => ({
      kind: "destination",
      id: d.id,
      label: d.label,
      sublabel: d.sublabel,
      href: d.href,
    }));

  return {
    categories,
    brands,
    products,
    destinations,
    /* The draw order, which is also the arrow-key order. Destinations
       first because they are the shortest list and the most decisive: if
       "Project Hub" is what you meant, nothing below it is. */
    flat: [...destinations, ...categories, ...brands, ...products],
  };
}

/**
 * Matches a parsed materials list against the catalogue.
 *
 * One query per line, run together rather than in sequence — a
 * twenty-line parcha is twenty index lookups, which Postgres answers in a
 * few milliseconds, and doing them serially would take twenty round trips
 * to the database region.
 *
 * A line with no match is returned with `product: null` rather than being
 * dropped. The customer wrote it, so it stays on their list; what Quoin
 * cannot price it needs to say so, not quietly shorten the order.
 */
export async function matchParchaLines(
  terms: string[],
): Promise<(Suggestion | null)[]> {
  return Promise.all(
    terms.map(async (term) => {
      const q = term.trim();
      if (q.length < 2) return null;
      const { products } = await suggest(q, 1);
      return products[0] ?? null;
    }),
  );
}
