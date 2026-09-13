import { one } from "@/lib/search-params";
import { toPaise, type BrowseParams } from "@/lib/browse-params";
import type { ProductSort } from "@/lib/data/catalog";
import { PRICING_UNIT_LABEL, type FulfilmentType, type PricingUnit } from "@/lib/types/catalog";

/**
 * Turns a route's `searchParams` into the two shapes the browse pages
 * need: the raw strings the links are rebuilt from, and the typed query
 * the data layer takes.
 *
 * One place, because every listing page — `/products`, `/c/[slug]`,
 * `/deals`, search results — reads the same parameters, and three copies
 * of this parsing is three chances for `?offers=1` to mean something
 * different depending on which page you are on.
 */

const FULFILMENTS: FulfilmentType[] = [
  "instant",
  "scheduled",
  "bookable",
  "made_to_order",
];
const SORT_IDS: ProductSort[] = ["name", "newest", "price"];

/** Every unit the catalogue prices by — the "Size" chip's valid values. */
const PRICING_UNITS = Object.keys(PRICING_UNIT_LABEL) as PricingUnit[];

export function readBrowseParams(
  sp: Record<string, string | string[] | undefined>,
): BrowseParams {
  return {
    q: one(sp.q),
    brand: one(sp.brand),
    fulfilment: one(sp.fulfilment),
    unit: one(sp.unit),
    min: one(sp.min),
    max: one(sp.max),
    offers: one(sp.offers),
    sort: one(sp.sort),
    page: one(sp.page),
    view: one(sp.view),
  };
}

/**
 * The typed query.
 *
 * Unrecognised values are dropped rather than rejected: a stale link with
 * `?sort=cheapest` should still show products, in the default order,
 * instead of a 400 page. The same goes for a `fulfilment` that no longer
 * exists.
 */
export function toProductQuery(params: BrowseParams) {
  const fulfilment = params.fulfilment as FulfilmentType | undefined;
  const unit = params.unit as PricingUnit | undefined;
  const sort = params.sort as ProductSort | undefined;

  return {
    brandSlug: params.brand,
    fulfilment: fulfilment && FULFILMENTS.includes(fulfilment) ? fulfilment : undefined,
    pricingUnit: unit && PRICING_UNITS.includes(unit) ? unit : undefined,
    search: params.q,
    minPricePaise: toPaise(params.min),
    maxPricePaise: toPaise(params.max),
    discountedOnly: params.offers === "1",
    sort: sort && SORT_IDS.includes(sort) ? sort : undefined,
    page: Number(params.page) || 1,
  };
}
