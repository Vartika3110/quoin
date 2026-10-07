import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/env";

/**
 * `/robots.txt`, which until now 404'd.
 *
 * The disallow list is the interesting part, and every entry on it is a
 * path that either cannot work for a crawler or should not be in an
 * index:
 *
 * `/admin` and `/api` — the first already answers 404 to anyone who is
 * not staff and the second is JSON, so neither is a disclosure to list
 * here; what listing them buys is not spending crawl budget discovering
 * that for itself.
 *
 * `/account`, `/cart`, `/checkout` — per-customer pages that render a
 * signed-out shell to a crawler. Indexing them would put an empty cart in
 * search results under Quoin's name.
 *
 * `/studio/pin` and `/studio/image` — the interception-routed modal
 * variants of pins that already have canonical pages elsewhere. Letting
 * both in is a duplicate-content problem this app does not need.
 *
 * `/vendor` — a vendor's dispatch URL *is* its credential
 * (`OrderFulfilment.actionToken`), so the path must not be followed,
 * indexed or kept by anything. The page sends `noindex, nocache` of its
 * own as well; this is the half that stops a crawler ever requesting it,
 * and a GET on that page writes nothing, so a well-behaved crawler could
 * do no harm even if it did.
 *
 * Nothing else is excluded. The catalogue is the whole point.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin().toString().replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api/",
          "/account",
          "/cart",
          "/checkout",
          "/signin",
          "/studio/pin/",
          "/studio/image/",
          "/vendor",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    /* Absolute, and from the same `siteOrigin()` every canonical uses, so
       a domain change moves both together rather than leaving the sitemap
       pointing at a host the canonicals have already left. */
    host: origin,
  };
}
