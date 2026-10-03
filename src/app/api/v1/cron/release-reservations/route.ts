import { NextResponse } from "next/server";
import { isAuthorizedCron, refuseCron } from "@/lib/cron";
import { releaseExpiredReservations } from "@/lib/data/inventory";

/**
 * GET /api/v1/cron/release-reservations
 *
 * Gives back stock that a checkout reserved and then never paid for.
 *
 * `releaseExpiredReservations` has existed since the inventory engine was
 * built, and `POST /api/v1/admin/inventory/release-expired` has existed
 * to let a staff member run it — with a comment on that route saying
 * plainly that there was no scheduler in this app and that it was waiting
 * to be pointed at from wherever a periodic call eventually got made.
 * This is that caller. The admin route stays exactly as it is: a person
 * needs to be able to force a release without waiting for the next tick,
 * and the two cannot conflict.
 *
 * Safe to run as often as the schedule likes. Each order is claimed with
 * a guarded `UPDATE` that asserts the reservation is still both present
 * and expired, so a run that overlaps another — or overlaps a staff
 * member clicking the admin button — releases each reservation once and
 * reports the rest as not claimed.
 *
 * Nothing here touches money or order status. An order whose reservation
 * lapses stays `PENDING_PAYMENT` and stays payable; it simply stops
 * holding stock nobody has paid for. If a payment for it lands afterwards,
 * `settleCapturedPayment` commits against whatever is on hand then —
 * which is the honest outcome, and why the window is generous rather than
 * tight.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return refuseCron();

  const result = await releaseExpiredReservations();

  if (result.releasedOrders > 0) {
    console.info("[inventory] released expired reservations", result);
  }

  return NextResponse.json({ ok: true, ...result });
}
