import { z } from "zod";
import { handler, ok, requireUser } from "@/lib/http";
import {
  addToWishlist,
  listWishlist,
  removeFromWishlist,
} from "@/lib/data/wishlist";

/**
 * The signed-in customer's wishlist.
 *
 * Scoped to `requireUser()`'s id inside the data layer itself — there is
 * no `?userId=` here for a caller to widen it with, the same rule
 * `/api/v1/orders` follows.
 *
 * Signed out there is no wishlist to serve: the browser keeps its own and
 * folds it in at sign-in (`POST` with several slugs). That is why these
 * all 401 rather than falling back to anonymous storage — a server route
 * that silently did nothing would be indistinguishable from one that
 * worked.
 */

const Body = z.object({
  /* An array, so one route handles both a single heart and the merge of
     a signed-out list at sign-in. One slug is just a list of one. */
  slugs: z.array(z.string().min(1)).min(1).max(200),
});

const RemoveBody = z.object({ slug: z.string().min(1) });

export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ items: await listWishlist(user.id) });
});

/**
 * POST — heart one or more products.
 *
 * Idempotent: hearting something already saved keeps its original date
 * rather than jumping it to the top of the list.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const { slugs } = Body.parse(await request.json());
  await addToWishlist(user.id, slugs);
  return ok({ items: await listWishlist(user.id) });
});

/** DELETE — unheart one. Silent when it was not there. */
export const DELETE = handler(async (request) => {
  const user = await requireUser();
  const { slug } = RemoveBody.parse(await request.json());
  await removeFromWishlist(user.id, slug);
  return ok({ items: await listWishlist(user.id) });
});
