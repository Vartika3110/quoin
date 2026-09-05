import { ApiError, handler, ok, requireUser } from "@/lib/http";
import { getOrderForUser } from "@/lib/data/order-history";

type Ctx = { params: Promise<{ reference: string }> };

/**
 * GET /api/v1/orders/{reference}
 *
 * One order, in full — but only the requesting customer's own. See the
 * comment on `getOrderForUser` (src/lib/data/order-history.ts): a
 * reference belonging to someone else answers identically to one that
 * does not exist at all, because references are read aloud over the
 * phone and are guessable by design, and confirming that a guessed one is
 * real would itself be a disclosure.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { reference } = await params;

  const order = await getOrderForUser(user.id, reference);
  if (!order) throw new ApiError("not_found", "No such order");

  return ok({ order });
});
