import { ApiError, handler, ok, requireUser } from "@/lib/http";
import { unlinkOrder } from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string; reference: string }> };

/**
 * DELETE /api/v1/projects/{id}/orders/{reference}
 *
 * Unlinks an order from a project. Removes only the join row
 * (`ProjectOrder`) — the order itself is untouched, exactly as archiving
 * a project leaves its orders alone.
 */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, reference } = await params;

  const removed = await unlinkOrder(user.id, id, reference);
  if (!removed) throw new ApiError("not_found", "No such linked order");

  return ok({ deleted: true });
});
