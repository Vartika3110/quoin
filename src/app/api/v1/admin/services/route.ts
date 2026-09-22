import type { ServiceBookingStatus } from "@prisma/client";
import { handler, ok, requireStaff } from "@/lib/http";
import { BOOKING_STATUS_LABEL } from "@/lib/services/booking-status";
import { listBookingsForStaff } from "@/lib/data/service-bookings";

const STATUS_VALUES: ReadonlySet<string> = new Set(Object.keys(BOOKING_STATUS_LABEL));

/** A stale or hand-edited `?status=` shows the unfiltered queue rather
    than erroring — same treatment `parseOrderStatusFilter` gives a bad
    order-status filter. */
function parseStatusFilter(value: string | null): ServiceBookingStatus | undefined {
  return value && STATUS_VALUES.has(value) ? (value as ServiceBookingStatus) : undefined;
}

/**
 * GET /api/v1/admin/services
 *
 * The service queue staff work from — every booking and quote request,
 * across every customer, newest first.
 */
export const GET = handler(async (request) => {
  await requireStaff();

  const { searchParams } = new URL(request.url);
  const status = parseStatusFilter(searchParams.get("status"));
  const page = Number(searchParams.get("page")) || undefined;

  const result = await listBookingsForStaff({ status, page });
  return ok(result);
});
