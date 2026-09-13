import { ApiError, handler, ok, requireStaff } from "@/lib/http";
import { markStockAlertContacted } from "@/lib/data/stock-alerts";

type Ctx = { params: Promise<{ alertId: string }> };

/**
 * PATCH /api/v1/admin/stock-alerts/{alertId}
 *
 * Records that staff have contacted the customer behind a back-in-stock
 * request. The only write this request ever gets from the admin side —
 * there is no body, because "contacted, now" is the whole fact.
 */
export const PATCH = handler(async (_request, { params }: Ctx) => {
  await requireStaff();
  const { alertId } = await params;

  if (!(await markStockAlertContacted(alertId))) {
    throw new ApiError("not_found", "No such request");
  }

  return ok({ contacted: true });
});
