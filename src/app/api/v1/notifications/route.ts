import { handler, ok, requireUser } from "@/lib/http";
import { listNotifications } from "@/lib/data/notifications";

/**
 * GET /api/v1/notifications?limit=
 *
 * `listNotifications` already clamps `limit` to 1–50 (default 20), so
 * this route does not re-validate it — a stray `?limit=abc` becomes `NaN`,
 * which `Math.trunc(limit) || 20` inside it already treats as "not given".
 */
export const GET = handler(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit"));

  return ok(await listNotifications(user.id, limit));
});
