import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Caching for catalogue reads.
 *
 * Every page in this app is `force-dynamic` and every response carries
 * `cache-control: private, no-store`, so a cold request pays a Postgres
 * round trip for data that changes a few times a week. Measured against
 * production: a cold product page was 5.3s to first byte and 14.7s to
 * last, the home page 3.0s, and roughly a third of direct connections to
 * the Supabase pooler failed outright — on an uncached page every one of
 * those is a 500 for a customer.
 *
 * **This does not make any page static, and that is the point.** Pages
 * stay `force-dynamic`. `unstable_cache` caches the *data*, not the
 * render, so the session cookie, the stock lookup, the Pro rate and
 * everything else personal still run per request exactly as before. What
 * stops happening is asking Postgres for the same fourteen departments on
 * every single page view.
 *
 * **Why `unstable_cache` and not `use cache`.** Next 16 replaces it with
 * the `use cache` directive, and that is the right destination — but
 * `use cache` requires the `cacheComponents` flag, which changes the
 * caching model for the entire application and wants Suspense boundaries
 * around anything dynamic. That is a migration, not a hardening change,
 * and doing it in the same pass as a security and reliability fix would
 * make both hard to review. `node_modules/next/dist/docs/01-app/02-guides/
 * caching-without-cache-components.md` is the supported path for an app
 * that has not opted in, and this follows it. When the migration happens,
 * everything here becomes a `use cache` directive plus `cacheLife`, and
 * the call sites in `catalog.ts` do not move.
 *
 * **What is deliberately not cached.** `listProducts` and
 * `getProductFacets` take a query object built from arbitrary URL
 * parameters — brand, size, price band, sort, page. The key space is
 * effectively unbounded, so the hit rate would be poor and the data cache
 * would fill with entries nobody asks for twice. They stay live.
 * `getRelatedProducts` takes a whole `Product` as its argument, which
 * `unstable_cache` would stringify into the cache key; that is a bad key
 * and a silent one, so it stays live too.
 */

/**
 * Everything catalogue-shaped, for a blunt "the catalogue moved" sweep.
 *
 * The importer is the main thing that moves it, and the importer runs
 * from a laptop against the database directly — it cannot call
 * `revalidateTag`, because it is not running inside the server at all.
 * That is why every window below is a *time* as well as a tag: the tags
 * make an in-app edit appear immediately, and the TTL is what eventually
 * picks up a change this process never saw.
 */
export const CATALOGUE_TAG = "catalogue";

/** One product, so pricing or photographing it does not sweep the rest. */
export function productTag(slug: string): string {
  return `product:${slug}`;
}

/**
 * How long navigation and taxonomy may be stale.
 *
 * Departments, brands and the "from ₹x" floors change when somebody runs
 * an import, which is weekly at most. An hour of staleness on a category
 * name is invisible; an hour of staleness costs one query instead of one
 * per page view across every page in the app.
 */
export const TAXONOMY_TTL_SECONDS = 60 * 60;

/**
 * How long a product's own row may be stale.
 *
 * Much shorter, because this one carries a price. Nothing a customer is
 * charged depends on it — `quoteCart` re-prices every line against the
 * live catalogue at checkout and surfaces a `price_changed` diff the
 * customer has to accept before paying, which is exactly the protection
 * that makes caching a displayed price safe at all. But "safe" is not
 * "pleasant": being quoted one number on the page and a different one at
 * checkout is a bad moment even when it is handled correctly, so the
 * window is five minutes rather than an hour, and an admin edit clears it
 * outright through `revalidateProduct`.
 */
export const PRODUCT_TTL_SECONDS = 5 * 60;

/**
 * Wraps a read so it is served from the data cache.
 *
 * A thin pass-through to `unstable_cache` rather than anything clever —
 * its value is that the policy lives in one file with the reasoning
 * above, instead of a TTL being chosen ad hoc at fifteen call sites and
 * drifting.
 *
 * `keyParts` must be unique per function. `unstable_cache` does include
 * the arguments, but it derives the rest of the key from the function's
 * source text, which means two reads that happen to compile to the same
 * body can collide. Naming each one explicitly removes the question.
 */
export function cachedRead<Args extends unknown[], T>(
  read: (...args: Args) => Promise<T>,
  keyParts: string[],
  options: { revalidate: number; tags: string[] },
) {
  return unstable_cache(read, keyParts, options);
}

/**
 * How a tag is cleared, and why not the recommended way.
 *
 * Next 16 takes a profile as a second argument and recommends `"max"`,
 * which marks the entry stale and serves it once more while refreshing
 * behind the scenes. That is the right default for a blog, and the wrong
 * one here: every caller below is a staff member who has *just* priced or
 * photographed a product and is about to look at it. Showing them the
 * previous value one more time is precisely the bug this invalidation
 * exists to prevent, and it is the kind that gets reported as "the admin
 * didn't save".
 *
 * `{ expire: 0 }` expires immediately, so the next read is a miss and
 * waits for fresh data. The read-your-own-writes helper meant for this,
 * `updateTag`, is deliberately not used: it can only be called from a
 * Server Action, and every writer here is a Route Handler — Next's own
 * documentation points that case back at `revalidateTag`.
 *
 * The single-argument form is deprecated in this version. Nothing here
 * uses it.
 */
const IMMEDIATE = { expire: 0 } as const;

/**
 * Clears everything catalogue-shaped.
 *
 * For a writer that changes something shared — a category, a brand, a
 * price floor. Callable only from a Route Handler or a Server Action,
 * which is where every caller of it lives.
 */
export function revalidateCatalogue(): void {
  revalidateTag(CATALOGUE_TAG, IMMEDIATE);
}

/**
 * Clears one product, and the shared lists it appears in.
 *
 * Both, deliberately. Pricing a product for the first time does not only
 * change its own page — it moves the department's "from ₹x" floor and
 * makes the row appear in listings it was absent from. Sweeping the
 * catalogue tag as well costs one extra round of recomputation on the
 * next request and avoids a product page that is correct while the
 * department index above it still says the product has no price.
 */
export function revalidateProduct(slug: string): void {
  revalidateTag(productTag(slug), IMMEDIATE);
  revalidateTag(CATALOGUE_TAG, IMMEDIATE);
}
