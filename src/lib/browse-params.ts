import type { FulfilmentType } from "@/lib/types/catalog";
import type { ProductSort } from "@/lib/data/catalog";

/**
 * The browse query, as it appears in the URL.
 *
 * Filters live in the address bar rather than in component state, which is
 * a decision with consequences worth naming: a filtered result is
 * shareable, the back button steps through filter changes, the page needs
 * no JavaScript to filter at all, and the server can render the grid
 * without a round trip. The cost is a navigation per interaction, which is
 * the right trade for a catalogue this size.
 */

export interface BrowseParams {
  q?: string;
  brand?: string;
  fulfilment?: string;
  /** Rupees in the URL, paise everywhere else — see `toPaise`. */
  min?: string;
  max?: string;
  /** "1" when only discounted products should show. */
  offers?: string;
  sort?: string;
  page?: string;
  /** "grid" (default) or "list". */
  view?: string;
}

export const SORTS: { id: ProductSort; label: string }[] = [
  { id: "name", label: "Name A–Z" },
  { id: "newest", label: "Newest first" },
  { id: "price", label: "Price, low to high" },
];

export const FULFILMENT_LABEL: Record<FulfilmentType, string> = {
  instant: "In 18 minutes",
  scheduled: "Scheduled delivery",
  made_to_order: "Made to order",
  bookable: "Bookable visit",
};

/**
 * Rebuilds the current URL with parameters changed.
 *
 * Setting a value to `undefined` removes it. Any change other than the
 * page itself resets paging — changing a filter must not leave you on
 * page 7 of a result set that no longer has seven pages.
 */
export function withParams(
  basePath: string,
  current: BrowseParams,
  changes: Partial<BrowseParams>,
): string {
  const next = new URLSearchParams();
  const merged = { ...current, ...changes };

  const onlyPageChanged =
    Object.keys(changes).length === 1 && "page" in changes;
  if (!onlyPageChanged) delete merged.page;

  for (const [key, value] of Object.entries(merged)) {
    if (value) next.set(key, value);
  }

  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Toggles a single-select filter: picking the active value clears it. */
export function toggleParam(
  basePath: string,
  current: BrowseParams,
  key: keyof BrowseParams,
  value: string,
): string {
  return withParams(basePath, current, {
    [key]: current[key] === value ? undefined : value,
  });
}

/**
 * Rupees from the URL to paise for the query.
 *
 * The URL carries rupees because that is what the customer typed and what
 * a shared link should read as; everything past this boundary is paise,
 * integer, like the rest of the money in the app.
 */
export function toPaise(rupees: string | undefined): number | undefined {
  if (!rupees) return undefined;
  const n = Number(rupees);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

/** How many filters are on, for the "Filters (3)" button and the reset. */
export function activeFilterCount(params: BrowseParams): number {
  return [params.brand, params.fulfilment, params.min, params.max, params.offers].filter(
    Boolean,
  ).length;
}
