import { handler, ok, requireStaff } from "@/lib/http";
import { releaseExpiredReservations } from "@/lib/data/inventory";

/**
 * POST /api/v1/admin/inventory/release-expired
 *
 * Releases every `PENDING_PAYMENT` order whose stock reservation has
 * expired, giving the stock back for someone else to buy.
 *
 * This used to say there was no cron infrastructure in this app and that
 * something would eventually have to be pointed at this endpoint. There
 * is now: `GET /api/v1/cron/release-reservations`, on a Vercel schedule
 * in `vercel.json`, calling the same `releaseExpiredReservations`.
 *
 * This route stays, and is not a duplicate of it. A staff member needs to
 * be able to force a release without waiting up to ten minutes for the
 * next tick — most obviously while they are on the phone to a customer
 * about stock. The two cannot conflict: each order is claimed by a
 * guarded `UPDATE` asserting the reservation is still both present and
 * expired, so whichever caller arrives second releases nothing and says
 * so. See `releaseExpiredReservations`.
 */
export const POST = handler(async () => {
  await requireStaff();
  const result = await releaseExpiredReservations();
  return ok(result);
});
