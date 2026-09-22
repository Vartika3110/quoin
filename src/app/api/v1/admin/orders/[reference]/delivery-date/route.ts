import { z } from "zod";
import { CALENDAR_DAY_MESSAGE, isCalendarDay, toCalendarDate } from "@/lib/data/projects";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";

type Ctx = { params: Promise<{ reference: string }> };

/* `null` clears the date; anything else must be a real calendar day —
   the same two-state-plus-absent shape `nullableDay` in
   `src/app/api/v1/projects/[id]/route.ts` uses, minus the "absent leaves
   it alone" branch: this endpoint's whole body is this one field, so
   there is no third state to distinguish. */
const Body = z.object({
  date: z.union([z.null(), z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE)]),
});

/**
 * PATCH /api/v1/admin/orders/{reference}/delivery-date
 *
 * Sets or clears `Order.expectedDeliveryOn` — the delivery day a person
 * at Quoin has actually committed to, staff only. There is no customer
 * route that writes this column: nothing behind this app schedules a
 * slot, so the only honest source for a delivery date is a person
 * choosing one, never a computation from a lead time — see the model
 * comment on `expectedDeliveryOn`.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  await requireStaff();
  const { reference } = await params;
  const { date } = await parseBody(request, Body);

  const order = await db.order.findUnique({ where: { reference }, select: { id: true } });
  if (!order) throw new ApiError("not_found", "No such order");

  const updated = await db.order.update({
    where: { id: order.id },
    data: { expectedDeliveryOn: date ? toCalendarDate(date) : null },
    select: { expectedDeliveryOn: true },
  });

  return ok({
    expectedDeliveryOn: updated.expectedDeliveryOn
      ? updated.expectedDeliveryOn.toISOString().slice(0, 10)
      : null,
  });
});
