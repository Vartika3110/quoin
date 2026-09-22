import { ApiError, handler, ok, requireUser } from "@/lib/http";
import { getBookingForUser } from "@/lib/data/service-bookings";

type Ctx = { params: Promise<{ reference: string }> };

/**
 * GET /api/v1/services/bookings/{reference}
 *
 * Scoped to the caller in the `where` clause of `getBookingForUser` — a
 * reference belonging to someone else 404s exactly like one that was
 * never issued, matching `getOrderForUser`.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { reference } = await params;

  const booking = await getBookingForUser(user.id, reference);
  if (!booking) throw new ApiError("not_found", "No such service booking");

  return ok({ booking });
});
