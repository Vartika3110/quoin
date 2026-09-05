import { handler, ok, requireStaff } from "@/lib/http";
import { releaseExpiredReservations } from "@/lib/data/inventory";

/**
 * POST /api/v1/admin/inventory/release-expired
 *
 * Releases every `PENDING_PAYMENT` order whose stock reservation has
 * expired, giving the stock back for someone else to buy.
 *
 * There is no cron infrastructure in this app — see
 * `docs/production-audit.md` and `AGENTS.md` — so nothing calls this on a
 * timer. This endpoint is the thing that has to be pointed at from
 * wherever a periodic call actually gets made: a deploy platform's own
 * scheduled-job feature, an external uptime pinger, or a person running
 * it by hand. It is deliberately idempotent-safe to call as often or as
 * rarely as that turns out to be — see `releaseExpiredReservations`.
 */
export const POST = handler(async () => {
  await requireStaff();
  const result = await releaseExpiredReservations();
  return ok(result);
});
