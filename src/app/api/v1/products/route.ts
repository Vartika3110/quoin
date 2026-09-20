import { z } from "zod";
import { handler, ok } from "@/lib/http";
import { DEFAULT_PAGE_SIZE, listProducts } from "@/lib/data/catalog";
import { readBrowseParams, toProductQuery } from "@/lib/browse-request";

/**
 * The two parameters that are not part of a listing URL's own query.
 *
 * `category` is in the path on `/c/[slug]` rather than the query string,
 * and `pageSize` is the caller's business — a browse page takes the
 * default, and nothing else should be able to ask for ten thousand rows.
 */
const Extra = z.object({
  category: z.string().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
});

/**
 * GET /api/v1/products
 *
 * Public: browse must work before sign-in. Prices here are the standard
 * ones — Pro rates are carried per variant as `proPrice` and applied by
 * the client, which is safe because they are not secret, and re-resolved
 * server-side at checkout, which is where it matters.
 *
 * **The filters are parsed by `readBrowseParams`/`toProductQuery`, the
 * same pair the listing pages use.** This route used to restate them in
 * a Zod schema of its own that knew about `category`, `brand`,
 * `fulfilment`, `q`, `sort` and `page` — and not about `unit`, `min`,
 * `max` or `offers`. That was survivable while nothing in the app called
 * it. It stopped being survivable when the grid started fetching its own
 * next page: a customer filtered to taps under ₹5,000 would scroll to
 * the bottom and be handed page two of the *unfiltered* catalogue,
 * appended to their filtered results with nothing to indicate it. The
 * parsing belongs in one place for the same reason the pages already
 * share it.
 *
 * Accepts every parameter a listing URL carries — `?q=` `?brand=`
 * `?fulfilment=` `?unit=` `?min=` `?max=` `?offers=1` `?sort=` `?page=` —
 * plus `?category=` and `?pageSize=`.
 */
export const GET = handler(async (request) => {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams);

  const extra = Extra.safeParse(raw);
  /* Unparseable filters fall back to the default listing rather than a
     400: a bad `sort` in a shared link should still show products.
     `toProductQuery` already drops values it does not recognise. */
  const { category, pageSize } = extra.success ? extra.data : Extra.parse({});

  const result = await listProducts({
    ...toProductQuery(readBrowseParams(raw)),
    categorySlug: category,
    pageSize,
  });

  return ok(result);
});
