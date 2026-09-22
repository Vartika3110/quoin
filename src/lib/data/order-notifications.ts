import type { OrderStatus } from "@prisma/client";
import { notify } from "@/lib/data/notifications";

/**
 * The bell-icon notifications an order's own status changes ring.
 *
 * Deliberately narrow: only the four transitions a customer would
 * actually want pinged for produce one, and every other status (`PAID`
 * itself, `PACKED`, every terminal status) is silently a no-op rather than
 * a `default` branch that has to be remembered to stay empty. `PAID` is
 * excluded on purpose — `PAYMENT_SUCCESSFUL` exists on `NotificationKind`
 * for it, but nothing wires it yet, and pretending this function covers
 * that case would be worse than leaving it honestly unimplemented.
 *
 * Called from wherever `transitionOrderStatus` is actually invoked
 * (`POST /api/v1/admin/orders/{reference}/status` — the order board's own
 * advance button posts to that same route, so there is nowhere else that
 * needs this), always *after* the transition's own transaction has
 * committed — see the module comment on `notify` for why.
 */
export async function notifyOrderStatus(input: {
  userId: string;
  reference: string;
  status: OrderStatus;
}): Promise<void> {
  switch (input.status) {
    case "CONFIRMED":
      await notify({
        userId: input.userId,
        kind: "ORDER_CONFIRMED",
        title: `Order ${input.reference} confirmed`,
        body: "We've accepted your order and are preparing it.",
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:CONFIRMED`,
      });
      return;

    case "DISPATCHED":
      await notify({
        userId: input.userId,
        kind: "ORDER_SHIPPED",
        title: `Order ${input.reference} is on its way`,
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:DISPATCHED`,
      });
      return;

    case "OUT_FOR_DELIVERY":
      await notify({
        userId: input.userId,
        kind: "ORDER_SHIPPED",
        title: `Order ${input.reference} is out for delivery`,
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:OUT_FOR_DELIVERY`,
      });
      return;

    case "DELIVERED":
      await notify({
        userId: input.userId,
        kind: "ORDER_DELIVERED",
        title: `Order ${input.reference} delivered`,
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:DELIVERED`,
      });
      return;

    default:
      return;
  }
}
