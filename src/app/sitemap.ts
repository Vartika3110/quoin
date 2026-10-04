import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteOrigin } from "@/lib/env";

/**
 * `/sitemap.xml`, which until now 404'd.
 *
 * Two rules decide what goes in it, and both matter more than the list
 * itself.
 *
 * **Only pages a customer can actually act on.** The buyable filter here
 * is the same one `/products` lists by — active, with at least one active
 * variant. The catalogue carries several hundred rows that are active but
 * have no sellable variant, left over from damaged PDF imports; they
 * already `notFound()` when visited and are already absent from search,
 * and submitting them to Google would be submitting a few hundred known
 * 404s. A sitemap full of soft-404s costs crawl budget on the pages that
 * do work.
 *
 * **Nothing per-customer, nothing behind a sign-in.** Cart, checkout,
 * account and admin are excluded here and disallowed in `robots.ts` —
 * one decision expressed in both places, because a sitemap entry is a
 * request to index and a robots rule is a request not to crawl, and
 * contradicting yourself across the two is how a page ends up indexed
 * with no snippet.
 *
 * `lastModified` comes from each row's own `updatedAt` rather than the
 * build time. A build-time stamp tells a crawler that all three thousand
 * products changed every deploy, which teaches it to ignore the field.
 */
/**
 * Built per request, not at deploy.
 *
 * Next prerenders a sitemap by default, which means running the two
 * queries below during `next build` — and that fails the build outright
 * wherever the database is not reachable from the build step, which is
 * every CI runner and any Vercel build whose connection string is
 * injected at runtime. It did: the first build with this file in place
 * died on `Export encountered an error on /sitemap.xml`.
 *
 * Marking it dynamic is also the more correct answer regardless. A
 * sitemap baked at deploy time is a snapshot of the catalogue as it was
 * when somebody last pushed code, and this catalogue changes by import
 * run rather than by deploy — so a prerendered one would go stale the
 * first time a few hundred products were added without a release. Every
 * other page in this app is `force-dynamic` for related reasons.
 *
 * The cost is two indexed queries per fetch, and a sitemap is fetched by
 * crawlers rather than customers.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin().toString().replace(/\/$/, "");

  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { isActive: true, variants: { some: { isActive: true } } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      /* Google's own limit is 50,000 URLs per file. This catalogue is far
         below it, and the cap is here so that an import which doubles the
         catalogue cannot silently produce an invalid sitemap. */
      take: 45_000,
    }),
    db.category.findMany({
      select: { slug: true, updatedAt: true },
    }),
  ]);

  /**
   * The hand-written pages, with priorities that say something true.
   *
   * The storefront's entry points rank above the legal pages because
   * that is the actual difference in how much Quoin wants them crawled —
   * not because a higher number is better. The legal pages are included
   * at all because a payment gateway and a regulator both expect them to
   * be publicly findable.
   */
  const fixed: MetadataRoute.Sitemap = [
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
    { url: `${origin}/privacy`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${origin}/terms`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${origin}/refunds`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${origin}/contact`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${origin}/grievance`, priority: 0.3, changeFrequency: "yearly" },
  ];

  return [
    ...fixed,
    ...categories.map((c) => ({
      url: `${origin}/c/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${origin}/p/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
