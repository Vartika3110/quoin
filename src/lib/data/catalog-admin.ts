import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  PRODUCT_SWATCH_BY_CATEGORY,
  resolvePhoto,
  SELLABLE_PRODUCT,
} from "@/lib/data/catalog";
import {
  type CatalogueProduct,
  type CatalogueStatus,
  type CatalogueVariant,
} from "@/lib/admin/catalogue-view";
import { firstFreeSlug, firstFreeValue, slugifyProduct } from "@/lib/catalogue-slug";
import { PRODUCT_SLUG_MAX_LENGTH } from "@/lib/types/catalog";

/**
 * The catalogue, as merchandising sees it.
 *
 * `src/lib/data/catalog.ts` answers one question — what may a customer be
 * shown — and every query in it is filtered to `isActive` products with a
 * sellable variant. This file deliberately answers the opposite: it has to
 * show the rows the storefront is hiding, because the reason a product is
 * missing from the shop is the thing someone opens this screen to find
 * out. Retired rows, rows with no price, rows nobody has photographed —
 * all of them are here, labelled.
 *
 * This is the interface `docs/django-to-prisma.md` records as the known
 * gap left by deleting the Django service: roughly 880 products need
 * prices set, names fixed and lines retired by people who are not
 * developers, and `prisma studio` is not something to point an ops team
 * at — it has no auth, no roles and no guardrails.
 *
 * Nothing here is cached and nothing needs to be invalidated. `/`,
 * `/products` and `/p/[slug]` are all `force-dynamic` and there is no
 * `unstable_cache` or `use cache` in the app, so a write through this
 * module is on the storefront the next time a page is requested. If
 * caching is ever added, this is the module whose writes have to
 * invalidate it.
 */

/* Re-exported so a server caller can keep taking the row shape and the
   query shape from one module. The declarations live in
   `src/lib/admin/catalogue-view.ts` because the client row needs the
   label maps and must not reach `db` to get them. */
export type { CatalogueProduct, CatalogueStatus, CatalogueVariant };
export { FULFILMENT_LABEL, UNIT_LABEL } from "@/lib/admin/catalogue-view";

export interface CatalogueQuery {
  q?: string;
  brandSlug?: string;
  categorySlug?: string;
  status?: CatalogueStatus;
  page?: number;
}

export const CATALOGUE_PAGE_SIZE = 24;

/**
 * Each status as a `where` fragment.
 *
 * `live` is imported from the storefront's own query rather than written
 * out again: "in the shop" has to mean exactly one thing, or this screen
 * will eventually label a row live that a customer cannot see.
 */
export function statusWhere(status: CatalogueStatus): Prisma.ProductWhereInput {
  switch (status) {
    case "live":
      return SELLABLE_PRODUCT;
    case "unpriced":
      return { isActive: true, variants: { none: {} } };
    case "hidden":
      return { isActive: true, variants: { some: {}, none: { isActive: true } } };
    case "retired":
      return { isActive: false };
  }
}

function whereFor(query: CatalogueQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (query.status) and.push(statusWhere(query.status));
  if (query.brandSlug) and.push({ brand: { slug: query.brandSlug } });
  if (query.categorySlug) and.push({ category: { slug: query.categorySlug } });

  const q = query.q?.trim();
  if (q) {
    /* The same three columns `/admin/inventory` searches, plus the brand
       name: staff look a product up by whatever is printed on the box,
       which is as often "Hafele" as it is the SKU. */
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { brand: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function statusOf(row: { isActive: boolean; variants: { isActive: boolean }[] }): CatalogueStatus {
  if (!row.isActive) return "retired";
  if (row.variants.some((v) => v.isActive)) return "live";
  return row.variants.length === 0 ? "unpriced" : "hidden";
}

export async function listCatalogueProducts(query: CatalogueQuery = {}): Promise<{
  items: CatalogueProduct[];
  total: number;
  totalPages: number;
  page: number;
}> {
  const where = whereFor(query);
  const page = Math.max(1, query.page ?? 1);

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true, slug: true } },
        /* Every variant, active or not — a deactivated variant is one of
           the reasons a product can be missing from the shop, and hiding
           it here would make that state unexplainable from this screen.
           Nested `_count` rather than a second pass: an inventory row
           blocks a hard delete, and the row has to know that before its
           delete button is offered. */
        variants: {
          orderBy: { pricePaise: "asc" },
          include: { _count: { select: { inventoryItems: true } } },
        },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * CATALOGUE_PAGE_SIZE,
      take: CATALOGUE_PAGE_SIZE,
    }),
  ]);

  /* One grouped count for the whole page rather than a count per row:
     24 products would otherwise cost 24 queries, which is the exact trap
     `docs/django-to-prisma.md` records the Django code having warned
     about for variants. */
  const sold = new Map<string, number>();
  if (rows.length > 0) {
    const groups = await db.orderLine.groupBy({
      by: ["productSlug"],
      where: { productSlug: { in: rows.map((r) => r.slug) } },
      _count: { _all: true },
    });
    for (const g of groups) sold.set(g.productSlug, g._count._all);
  }

  return {
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE)),
    items: rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      slug: row.slug,
      name: row.name,
      brand: row.brand?.name ?? null,
      category: row.category?.name ?? null,
      status: statusOf(row),
      photo: resolvePhoto(row),
      swatch: row.category
        ? (PRODUCT_SWATCH_BY_CATEGORY[row.category.slug] ?? "cement")
        : "cement",
      fulfilment: row.fulfilment,
      pricingUnit: row.pricingUnit,
      gstRatePct: row.gstRatePct,
      stockTracked: row.stockTracked,
      orderLines: sold.get(row.slug) ?? 0,
      /* Inactive variants are kept rather than filtered out. A row that
         dropped them would show "no price" beside a product that has one,
         and would offer the first-price form for a variant that already
         exists — which the route correctly refuses, leaving a button that
         cannot work. */
      variants: row.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        label: v.label,
        mrpPaise: v.mrpPaise,
        pricePaise: v.pricePaise,
        proPricePaise: v.proPricePaise,
        minQty: v.minQty,
        stepQty: v.stepQty,
        isActive: v.isActive,
        stockedItems: v._count.inventoryItems,
      })),
    })),
  };
}

export async function getCatalogueStats(): Promise<{
  total: number;
  live: number;
  unpriced: number;
  retired: number;
}> {
  const [total, live, unpriced, retired] = await Promise.all([
    db.product.count(),
    db.product.count({ where: statusWhere("live") }),
    /* Matches `listUnpricedProducts` exactly — "active with no variant" —
       so this figure and the length of the `/admin/pricing` queue it
       links to can never disagree. */
    db.product.count({ where: statusWhere("unpriced") }),
    db.product.count({ where: statusWhere("retired") }),
  ]);

  return { total, live, unpriced, retired };
}

/**
 * Brands and categories for the filters and the new-product form.
 *
 * Not `listBrands()` from `src/lib/data/catalog.ts`: that one returns only
 * brands with something sellable, which is right for a storefront facet
 * and wrong here — a brand whose every product is unpriced is exactly the
 * brand someone has opened this screen to fix.
 */
export async function listCatalogueBrands(): Promise<{ id: string; slug: string; name: string }[]> {
  return db.brand.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listCatalogueCategories(): Promise<
  { id: string; slug: string; name: string }[]
> {
  return db.category.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** ---- slugs ---------------------------------------------------------- */

/**
 * A free product slug.
 *
 * Slugs are permanent once assigned — the importer only ever sets them on
 * creation, so that re-importing never changes a URL that has been
 * indexed — which makes this the one moment the URL of a hand-added
 * product is decided.
 */
export async function reserveProductSlug(parts: {
  brand?: string | null;
  name: string;
  sku: string;
}): Promise<string> {
  const base = `${parts.brand ?? ""} ${parts.name} ${parts.sku}`;

  /* The same root `firstFreeSlug` will derive, computed here so the query
     can ask for just the slugs that could collide with it rather than
     reading every slug in the catalogue. */
  const root = slugifyProduct(base).slice(0, PRODUCT_SLUG_MAX_LENGTH);

  const clashes = await db.product.findMany({
    where: { OR: [{ slug: root }, { slug: { startsWith: `${root}-` } }] },
    select: { slug: true },
  });

  return firstFreeSlug(base, PRODUCT_SLUG_MAX_LENGTH, new Set(clashes.map((c) => c.slug)));
}

/** A free variant SKU, given the product's. Suffixed as the importer's is. */
export async function reserveVariantSku(productSku: string): Promise<string> {
  const root = `${productSku}-STD`;

  const clashes = await db.productVariant.findMany({
    where: { OR: [{ sku: root }, { sku: { startsWith: `${root}-` } }] },
    select: { sku: true },
  });

  /* `firstFreeValue`, not `firstFreeSlug`: a variant SKU is a
     manufacturer's code and must keep its case. */
  return firstFreeValue(root, 180, new Set(clashes.map((c) => c.sku)));
}
