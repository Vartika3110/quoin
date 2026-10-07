import { ApiError, handler, ok, requireStaff } from "@/lib/http";
import { getFulfilmentById } from "@/lib/data/order-fulfilments";
import {
  dispatchOrderLeg,
  FulfilmentNotDispatchableError,
  FulfilmentNotFoundError,
} from "@/lib/data/order-dispatch";

type Ctx = { params: Promise<{ reference: string; fulfilmentId: string }> };

/**
 * POST /api/v1/admin/orders/{reference}/fulfilments/{fulfilmentId}/dispatch
 *
 * Dispatches one vendor's leg from the admin order page — for the store
 * that phoned instead of tapping their link, or whose number nobody has
 * filled in yet.
 *
 * The same function the vendor's own route calls (`dispatchOrderLeg`), so
 * there is one dispatch path and not two: one guarded claim, one roll-up
 * rule, one customer notification. The only difference is who it is
 * attributed to — `actorUserId` is the staff account here and null there,
 * and the audit note says "on behalf of" rather than "by".
 *
 * `reference` is in the path and checked against the fulfilment's own
 * order rather than being decoration. A fulfilment id is enough to find
 * the leg on its own, so the check is not load-bearing for
 * authorisation — every caller here is already staff — but a mismatched
 * pair means the page that built the request was looking at a different
 * order than it thought, and silently dispatching the leg it names
 * anyway is how a store gets told to send goods for somebody else's
 * order.
 */
export const POST = handler(async (_request, { params }: Ctx) => {
  const staff = await requireStaff();
  const { reference, fulfilmentId } = await params;

  const fulfilment = await getFulfilmentById(fulfilmentId);
  if (!fulfilment || fulfilment.orderReference !== reference) {
    throw new ApiError("not_found", "No such vendor assignment on this order");
  }

  try {
    const result = await dispatchOrderLeg({ fulfilmentId, actorUserId: staff.id });
    return ok({
      fulfilmentId: result.fulfilmentId,
      reference: result.orderReference,
      storeName: result.storeName,
      changed: result.changed,
      orderAdvanced: result.orderAdvanced,
      outstandingLegs: result.outstandingLegs,
    });
  } catch (error) {
    if (error instanceof FulfilmentNotFoundError) {
      throw new ApiError("not_found", error.message);
    }
    if (error instanceof FulfilmentNotDispatchableError) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }
});
