import { ApiError, handler, requireUser } from "@/lib/http";
import { getBookingForUser } from "@/lib/data/service-bookings";
import { buildIcs } from "@/lib/services/booking-helpers";

type Ctx = { params: Promise<{ reference: string }> };

/**
 * GET /api/v1/services/bookings/{reference}/calendar
 *
 * A `.ics` attachment, not JSON — this is the one route in this slice
 * that hands the browser a file instead of the `ok`/`ApiError` envelope,
 * because a calendar app expects `text/calendar` on the wire, not
 * `{"data": ...}`. 404s when there is nothing to put a date on — a quote
 * request that has not even had a preferred day given yet has nothing for
 * a calendar app to hold.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { reference } = await params;

  const booking = await getBookingForUser(user.id, reference);
  if (!booking) throw new ApiError("not_found", "No such service booking");

  if (!booking.scheduledAt && !booking.preferredDate) {
    throw new ApiError("not_found", "This booking has no date yet.");
  }

  const ics = buildIcs({
    uid: `${booking.reference}@quoin`,
    title: `Quoin: ${booking.serviceName}`,
    description: booking.requirements || undefined,
    location: [booking.siteLine, booking.siteCity].filter(Boolean).join(", ") || undefined,
    ...(booking.scheduledAt
      ? { start: new Date(booking.scheduledAt) }
      : { day: booking.preferredDate as string }),
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="quoin-${booking.reference}.ics"`,
    },
  });
});
