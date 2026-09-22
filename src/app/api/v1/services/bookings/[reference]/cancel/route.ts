import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import { customerAction, serviceBookingErrorCode } from "@/lib/data/service-bookings";

type Ctx = { params: Promise<{ reference: string }> };

const Body = z.object({
  reason: z.string().trim().max(300).optional(),
});

/**
 * POST /api/v1/services/bookings/{reference}/cancel
 *
 * The same action whether the booking never got a quote or has a
 * `QUOTE_RECEIVED` one being turned down — `customerAction` fills in
 * "Quote declined" as the reason on the latter when the customer leaves
 * this box empty, rather than leaving `cancelReason` blank on what is, to
 * Quoin, a "no" to a real number.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { reference } = await params;
  const body = await parseBody(request, Body);

  try {
    const booking = await customerAction(user.id, reference, "cancel", body.reason);
    return ok({ booking });
  } catch (error) {
    const code = serviceBookingErrorCode(error);
    if (code) throw new ApiError(code, (error as Error).message);
    throw error;
  }
});
