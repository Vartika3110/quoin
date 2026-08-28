import { z } from "zod";
import { handler, ok } from "@/lib/http";
import { DEFAULT_PAGE_SIZE, listProducts } from "@/lib/data/catalog";

const Query = z.object({
  category: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  fulfilment: z
    .enum(["instant", "scheduled", "bookable", "made_to_order"])
    .optional(),
  q: z.string().min(1).max(120).optional(),
  sort: z.enum(["name", "newest", "price"]).default("name"),
  page: z.coerce.number().int().min(1).default(1),
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
 * ?category= &brand= slugs, ?fulfilment=, ?q= search, ?sort=name|newest|price,
 * ?page= &pageSize=
 */
export const GET = handler(async (request) => {
  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));

  /* Unparseable filters fall back to the default listing rather than a
     400: a bad `sort` in a shared link should still show products. */
  const query = parsed.success ? parsed.data : Query.parse({});

  const result = await listProducts({
    categorySlug: query.category,
    brandSlug: query.brand,
    fulfilment: query.fulfilment,
    search: query.q,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  });

  return ok(result);
});
