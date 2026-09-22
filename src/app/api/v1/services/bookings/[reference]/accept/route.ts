import { ApiError, handler, ok, requireUser } from "@/lib/http";
import { customerAction, serviceBookingErrorCode } from "@/lib/data/service-bookings";

type Ctx = { params: Promise<{ reference: string }> };

/**
 * POST /api/v1/services/bookings/{reference}/accept
 *
 * The customer's own "yes" to a quote staff have sent. Nothing about the
 * price is taken from this request — there is none to take; `quotePaise`
 * was written by `staffUpdate` and this route only moves the status onto
 * `CONFIRMED`, which `canTransitionBooking` will refuse unless the booking
 * is actually sitting at `QUOTE_RECEIVED`.
 */
export const POST = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { reference } = await params;

  try {
    const booking = await customerAction(user.id, reference, "accept_quote");
    return ok({ booking });
  } catch (error) {
    const code = serviceBookingErrorCode(error);
    if (code) throw new ApiError(code, (error as Error).message);
    throw error;
  }
});
