import { z } from "zod";
import { handler, ok, requireUser } from "@/lib/http";
import { DEFAULT_ORDER_PAGE_SIZE, listOrdersForUser } from "@/lib/data/order-history";

const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(DEFAULT_ORDER_PAGE_SIZE),
});

/**
 * GET /api/v1/orders
 *
 * The signed-in customer's own orders, newest first, paginated. Scoped to
 * `requireUser()`'s id inside `listOrdersForUser` itself — there is no
 * `?userId=` here for a caller to widen it with.
 */
export const GET = handler(async (request) => {
  const user = await requireUser();

  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  /* Same fallback as GET /api/v1/products: a stale or hand-edited `?page=`
     on a customer's own order history should still show the first page
     rather than fail outright. */
  const query = parsed.success ? parsed.data : Query.parse({});

  return ok(await listOrdersForUser(user.id, query.page, query.pageSize));
});
