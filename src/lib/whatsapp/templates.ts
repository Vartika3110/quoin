import type { WhatsAppMessageType } from "@prisma/client";

/**
 * The six approved WhatsApp Business templates, and the only six.
 *
 * One per `WhatsAppMessageType`, which is one per milestone the
 * simplified lifecycle actually has. There is deliberately no
 * `order_accepted`, `order_preparing` or `order_ready` template: those
 * statuses do not exist (`src/lib/orders/lifecycle.ts`), so a template
 * for them could only ever be dead weight a later reader mistakes for a
 * feature that stopped working.
 *
 * **Why templates at all.** Outside a 24-hour customer-service window,
 * the WhatsApp Business Platform will only deliver a message whose body
 * Meta has pre-approved. Every message this app sends is unsolicited by
 * that definition — a customer who paid an hour ago has not messaged us —
 * so every one of them is a template send, with the variable parts passed
 * as positional parameters. `MESSAGE_MODE=text` exists for the days
 * before approval lands; see `src/lib/whatsapp/client.ts`.
 *
 * **Why the body text is here too.** The approved body lives in Meta's
 * dashboard, not in this repository, and this file cannot change what
 * Meta sends. `renderBody` is nonetheless the same copy, for three jobs
 * the real template cannot do: it is what the development console sender
 * prints, it is what the pre-approval text mode sends, and it is what
 * `docs/whatsapp-orders.md` tells the operator to paste into the
 * dashboard so the two cannot drift silently. If you change the copy
 * here, re-submit the template; if you change it in Meta, change it here.
 *
 * Pure: only a *type* is imported from `@prisma/client`, so this module
 * has no runtime Prisma dependency and can be unit-tested with no
 * database at all.
 */

/** The exact template names to register in the WhatsApp Manager. */
export const TEMPLATE_NAME: Record<WhatsAppMessageType, string> = {
  ORDER_PLACED: "order_placed_customer",
  NEW_VENDOR_ORDER: "new_order_vendor",
  ORDER_DISPATCHED: "order_dispatched_customer",
  OUT_FOR_DELIVERY: "order_out_for_delivery_customer",
  ORDER_DELIVERED: "order_delivered_customer",
  ORDER_CANCELLED: "order_cancelled_customer",
};

/** What the admin order page calls each message. */
export const MESSAGE_TYPE_LABEL: Record<WhatsAppMessageType, string> = {
  ORDER_PLACED: "Order confirmation",
  NEW_VENDOR_ORDER: "New order",
  ORDER_DISPATCHED: "Dispatch notification",
  OUT_FOR_DELIVERY: "Out-for-delivery notification",
  ORDER_DELIVERED: "Delivery notification",
  ORDER_CANCELLED: "Cancellation notification",
};

/** ---- The variables each template takes ------------------------------- */

export interface OrderPlacedVars {
  /** `{{customer_name}}` */
  customerName: string;
  /** `{{order_id}}` — the order *reference*, the code the customer quotes. */
  orderId: string;
  /** `{{order_items}}` — one line per item, already formatted. */
  orderItems: string;
  /** `{{total_amount}}` — rupees, already formatted, without the symbol. */
  totalAmount: string;
  /** `{{delivery_address}}` — one line. */
  deliveryAddress: string;
}

export interface NewVendorOrderVars {
  orderId: string;
  customerName: string;
  customerPhone: string;
  orderItems: string;
  /** `{{quantities}}` — the vendor's own lines only, as `2 × Title`. */
  quantities: string;
  totalAmount: string;
  /** `{{payment_status}}` — "Paid" or "Payment pending". */
  paymentStatus: string;
  deliveryAddress: string;
  /**
   * The vendor's dispatch link. Passed as the dynamic suffix of the
   * template's URL button, *not* as a body parameter: Meta rejects a URL
   * inside a body variable on most templates, and a button is also the
   * one tap the vendor's whole workflow consists of.
   */
  dispatchPath: string;
}

export interface OrderReferenceVars {
  orderId: string;
}

export interface OrderCancelledVars {
  orderId: string;
  /**
   * What to say about money. Built from the order's own payments and
   * refunds by `cancellationNote` (`src/lib/data/order-whatsapp.ts`) —
   * never invented here, and never promising a refund the gateway has
   * not been asked for.
   */
  refundNote: string;
}

/**
 * The discriminated union every send goes through. One variant per
 * template, so adding a seventh template without teaching `renderBody`
 * about it is a type error rather than an empty message.
 */
export type WhatsAppMessage =
  | { type: "ORDER_PLACED"; vars: OrderPlacedVars }
  | { type: "NEW_VENDOR_ORDER"; vars: NewVendorOrderVars }
  | { type: "ORDER_DISPATCHED"; vars: OrderReferenceVars }
  | { type: "OUT_FOR_DELIVERY"; vars: OrderReferenceVars }
  | { type: "ORDER_DELIVERED"; vars: OrderReferenceVars }
  | { type: "ORDER_CANCELLED"; vars: OrderCancelledVars };

/** ---- Positional parameters ------------------------------------------- */

/**
 * The template body parameters, in the order Meta will substitute them
 * for `{{1}}`, `{{2}}`, … — so this ordering **is** the template's
 * contract, and reordering it silently swaps two values in a live
 * message. The matching `{{n}}` positions are written out in
 * `docs/whatsapp-orders.md`.
 */
export function bodyParameters(message: WhatsAppMessage): string[] {
  switch (message.type) {
    case "ORDER_PLACED":
      return [
        message.vars.customerName,
        message.vars.orderId,
        message.vars.orderItems,
        message.vars.totalAmount,
        message.vars.deliveryAddress,
      ];
    case "NEW_VENDOR_ORDER":
      return [
        message.vars.orderId,
        message.vars.customerName,
        message.vars.customerPhone,
        message.vars.orderItems,
        message.vars.quantities,
        message.vars.totalAmount,
        message.vars.paymentStatus,
        message.vars.deliveryAddress,
      ];
    case "ORDER_DISPATCHED":
    case "OUT_FOR_DELIVERY":
    case "ORDER_DELIVERED":
      return [message.vars.orderId];
    case "ORDER_CANCELLED":
      return [message.vars.orderId, message.vars.refundNote];
  }
}

/**
 * The dynamic suffix for a template's URL button, or null for a template
 * that has no button. Only the vendor's message does.
 */
export function buttonUrlSuffix(message: WhatsAppMessage): string | null {
  return message.type === "NEW_VENDOR_ORDER" ? message.vars.dispatchPath : null;
}

/** ---- The copy ---------------------------------------------------------- */

/**
 * The message as a human reads it.
 *
 * A newline-joined string rather than a template literal with embedded
 * blank lines, because WhatsApp collapses nothing and the shape of these
 * messages is the whole of their readability.
 */
export function renderBody(message: WhatsAppMessage): string {
  switch (message.type) {
    case "ORDER_PLACED": {
      const v = message.vars;
      return [
        "🛒 ORDER CONFIRMED",
        "",
        `Hi ${v.customerName},`,
        "",
        `Your Quoin order #${v.orderId} has been placed successfully.`,
        "",
        "Items:",
        v.orderItems,
        "",
        "Total:",
        `₹${v.totalAmount}`,
        "",
        "Delivery Address:",
        v.deliveryAddress,
        "",
        "We'll keep you updated about your order.",
      ].join("\n");
    }

    case "NEW_VENDOR_ORDER": {
      const v = message.vars;
      return [
        "🛒 NEW QUOIN ORDER",
        "",
        `Order: #${v.orderId}`,
        "",
        "Customer:",
        v.customerName,
        "",
        "Phone:",
        v.customerPhone,
        "",
        "Items:",
        v.orderItems,
        "",
        "Quantity:",
        v.quantities,
        "",
        "Total:",
        `₹${v.totalAmount}`,
        "",
        "Payment:",
        v.paymentStatus,
        "",
        "Delivery Address:",
        v.deliveryAddress,
        "",
        "Status:",
        "NEW ORDER",
        "",
        `Dispatch this order: ${v.dispatchPath}`,
      ].join("\n");
    }

    case "ORDER_DISPATCHED":
      return [
        "🚚 ORDER DISPATCHED",
        "",
        `Your Quoin order #${message.vars.orderId} has been dispatched.`,
        "",
        "We'll update you when it is out for delivery.",
      ].join("\n");

    case "OUT_FOR_DELIVERY":
      return [
        "🛵 OUT FOR DELIVERY",
        "",
        `Your Quoin order #${message.vars.orderId} is out for delivery.`,
        "",
        "It should reach you soon.",
      ].join("\n");

    case "ORDER_DELIVERED":
      return [
        "✅ ORDER DELIVERED",
        "",
        `Your Quoin order #${message.vars.orderId} has been delivered successfully.`,
        "",
        "Thank you for shopping with Quoin!",
      ].join("\n");

    case "ORDER_CANCELLED":
      return [
        "❌ ORDER CANCELLED",
        "",
        `Your Quoin order #${message.vars.orderId} has been cancelled.`,
        "",
        message.vars.refundNote,
      ].join("\n");
  }
}
