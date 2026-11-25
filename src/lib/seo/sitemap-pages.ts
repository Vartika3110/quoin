import type { MetadataRoute } from "next";

/**
 * Which hand-written pages go into `/sitemap.xml`.
 *
 * Lifted out of `src/app/sitemap.ts` for the same reason the content
 * policy was lifted out of `proxy.ts`: the handler there imports `db`
 * and `env`, so importing it in a test needs a database and a configured
 * environment, and a list that cannot be asserted against is a list that
 * drifts. Six live pages — `/faq`, `/experts`, `/trending`, `/premium`,
 * `/lighting` and `/rooted` — had drifted out of both this list and
 * `robots.ts`, leaving a footer link as a crawler's only route to any of
 * them.
 *
 * The handler still owns the catalogue half, which is a query and
 * belongs next to the database.
 */

/**
 * The hand-written pages, with priorities that say something true.
 *
 * The storefront's entry points rank above the legal pages because
 * that is the actual difference in how much Quoin wants them crawled —
 * not because a higher number is better. The legal pages are included
 * at all because a payment gateway and a regulator both expect them to
 * be publicly findable.
 *
 * Exported, and taking `origin` rather than reading it, so that
 * `tests/sitemap.test.mts` can assert against the list without a
 * database — the handler below needs one and this does not. A
 * hand-written list goes stale the first time somebody adds a page,
 * which is how six live pages came to be in neither this list nor
 * `robots.ts`, reachable by a crawler only through a footer link.
 */
export function fixedSitemapPages(origin: string): MetadataRoute.Sitemap {
  return [
    { url: `${origin}/`, priority: 1, changeFrequency: "daily" },
    { url: `${origin}/products`, priority: 0.9, changeFrequency: "daily" },
    { url: `${origin}/categories`, priority: 0.8, changeFrequency: "weekly" },
    { url: `${origin}/deals`, priority: 0.7, changeFrequency: "daily" },
    { url: `${origin}/studio`, priority: 0.7, changeFrequency: "weekly" },
    { url: `${origin}/services`, priority: 0.7, changeFrequency: "weekly" },
    { url: `${origin}/upload`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${origin}/projects`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${origin}/pro`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${origin}/consult`, priority: 0.5, changeFrequency: "monthly" },
    /* Six pages that were live, indexable and in neither this list nor
       `robots.ts`, so the only route a crawler had to any of them was a
       footer link. They are editorial entry points rather than catalogue,
       so they rank below `/products` and above the legal pages. */
    { url: `${origin}/trending`, priority: 0.6, changeFrequency: "weekly" },
    { url: `${origin}/premium`, priority: 0.5, changeFrequency: "weekly" },
    { url: `${origin}/lighting`, priority: 0.5, changeFrequency: "weekly" },
    { url: `${origin}/rooted`, priority: 0.5, changeFrequency: "weekly" },
    { url: `${origin}/experts`, priority: 0.5, changeFrequency: "monthly" },
    /* `/faq` sits in the same `(legal)` group as the five pages below and
       is where a customer looking for the cancellation window lands, so
       it ranks above them rather than with them. */
    { url: `${origin}/faq`, priority: 0.4, changeFrequency: "monthly" },
    { url: `${origin}/privacy`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${origin}/terms`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${origin}/refunds`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${origin}/contact`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${origin}/grievance`, priority: 0.3, changeFrequency: "yearly" },
  ];
}
