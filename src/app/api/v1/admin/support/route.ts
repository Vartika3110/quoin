import { handler, ok, requireStaff } from "@/lib/http";
import { listSupportRequestsForStaff, parseSupportStatusFilter } from "@/lib/data/support";

/** GET /api/v1/admin/support?status=&page= — the support queue, staff only. */
export const GET = handler(async (request) => {
  await requireStaff();
  const url = new URL(request.url);

  const status = parseSupportStatusFilter(url.searchParams.get("status") ?? undefined);
  const page = Number(url.searchParams.get("page")) || undefined;

  return ok(await listSupportRequestsForStaff({ status, page }));
});
