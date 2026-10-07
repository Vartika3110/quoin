import type { OrderStatus, WhatsAppMessageType } from "@prisma/client";
import { db } from "@/lib/db";
import { siteOrigin } from "@/lib/env";
import { formatPrice } from "@/lib/types/catalog";
import { deliveryPhoneFor } from "@/lib/auth/phone";
import {
  createFulfilmentsForOrder,
  type CreatedFulfilment,
} from "@/lib/data/order-fulfilments";
import { sendOrderMessage } from "@/lib/data/whatsapp-notifications";
import type { WhatsAppMessage } from "@/lib/whatsapp/templates";

/**
 * The WhatsApp side of the order lifecycle: what gets said, to whom, and
 * at which moment.
 *
 * This module is the only thing that knows both an order and a template.
 * `whatsapp-notifications.ts` below it knows how to send one message once
 * and never twice; `whatsapp/client.ts` below that knows how to talk to
 * Meta. Neither of them can read an order, and that separation is what
 * keeps the idempotency logic testable without a database.
 *
 * **Nothing here can fail an order.** Every exported function swallows
 * everything, and every caller depends on that. By the time any of this
 * runs the order exists, the payment has settled or the status has moved,
 * and all of it is committed. A throw escaping to the Razorpay webhook
 * would be a 500 and hours of gateway retries against an order that is
 * perfectly fine; a throw escaping the admin status route would report a
 * failure for a transition that already happened. WhatsApp is secondary
 * to the order, always, and a message that could not be sent is a FAILED
 * row on the admin page with a retry button, never a rolled-back order.
 *
 * **Customers hear about milestones only.** Four messages on the happy
 * path — placed, dispatched, out for delivery, delivered — plus
 * cancelled. Nothing is sent for a payment attempt, a refund state, or
 * any of the retired internal statuses, because a notification the
 * customer cannot act on is spam with a delivery receipt.
 */

/** ---- The order, as a message needs it ---------------------------------- */

interface OrderContext {
  id: string;
  reference: string;
  status: OrderStatus;
  customerName: string;
  /** Null for an account with no number anywhere — see `safeRecipient`. */
  customerPhone: string | null;
  totalPaise: number;
  paymentStatusLabel: string;
  /**
   * Whether money was ever actually captured for this order — i.e.
   * whether it was ever *placed* at all.
   *
   * An order can be cancelled from `PENDING_PAYMENT`, and most orders in
   * that status are abandoned checkouts (the enum's own comment says so:
   * rows can sit there forever). Staff tidying those up must not send a
   * "your order has been cancelled" WhatsApp to everyone who once got as
   * far as the gateway and changed their mind — they were never told the
   * order existed, and a cancellation notice for an order they do not
   * think they placed is both confusing and, in bulk, spam. See the
   * guard in `notifyCustomerOfStatus`.
   */
  wasPlaced: boolean;
  deliveryAddress: string;
  /** Every line, formatted. The customer gets the whole order. */
  allItems: string;
  /** Per store, for the vendor split. Keyed by `OrderLine.storeId`. */
  itemsByStore: Map<string, { items: string; quantities: string; subtotalPaise: number }>;
  refundNote: string;
}

/** `₹1,234` → `1,234`: the copy supplies its own symbol, and a template
    variable that already contains one renders `₹₹`. */
function amount(paise: number): string {
  return formatPrice(paise).replace("₹", "");
}

/** `Chrome basin mixer (CP-204) × 2` — one per line, newline-joined.
    WhatsApp collapses nothing, so the newlines survive. */
function formatItems(
  lines: { title: string; variantLabel: string; qty: number }[],
): string {
  if (lines.length === 0) return "—";
  return lines
    .map((line) => {
      const variant = line.variantLabel && line.variantLabel !== line.title ? ` (${line.variantLabel})` : "";
      return `• ${line.title}${variant} × ${line.qty}`;
    })
    .join("\n");
}

/** The vendor's `{{quantities}}`: the picking list, quantity first. */
function formatQuantities(lines: { title: string; qty: number }[]): string {
  if (lines.length === 0) return "—";
  return lines.map((line) => `${line.qty} × ${line.title}`).join("\n");
}

function formatAddress(order: {
  shipName: string;
  shipLine1: string;
  shipLine2: string | null;
  shipLandmark: string | null;
  shipCity: string;
  shipState: string;
  shipPincode: string;
}): string {
  /* One line, comma-separated. A multi-line address inside a template
     variable is rejected by Meta — body parameters may not contain a
     newline — which is why this is joined and `formatItems` above, which
     feeds a parameter Meta *does* allow newlines in, is not. */
  return [
    order.shipName,
    order.shipLine1,
    order.shipLine2,
    order.shipLandmark ? `near ${order.shipLandmark}` : null,
    `${order.shipCity}, ${order.shipState} ${order.shipPincode}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * What the cancellation message says about money.
 *
 * Built from what the database actually records, and deliberately
 * conservative: this app has no refund-initiation route (see
 * `docs/production-audit.md`), so a message promising "your refund has
 * been processed" would be a promise nobody made. Three honest cases —
 * a refund row exists and is processed, money was captured and no refund
 * has been raised yet, or nothing was ever captured.
 */
function cancellationNote(payments: { status: string; refunds: { status: string }[] }[]): string {
  const captured = payments.some((payment) => payment.status === "CAPTURED");
  const refunds = payments.flatMap((payment) => payment.refunds);

  if (refunds.some((refund) => refund.status === "PROCESSED")) {
    return "Your refund has been processed and should reach your account within 5–7 working days.";
  }
  if (refunds.length > 0) {
    return "Your refund has been raised and we'll confirm as soon as it is processed.";
  }
  if (captured) {
    return "We'll be in touch about your refund shortly.";
  }
  return "No payment was taken for this order.";
}

/**
 * Loads everything every template could need, in one read.
 *
 * One query rather than one per message: a placed order sends one
 * customer message and one per vendor, and three round-trips per vendor
 * on an already-committed webhook path is how a notification layer
 * becomes the slowest thing in a payment flow.
 */
async function loadOrderContext(orderId: string): Promise<OrderContext | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      reference: true,
      status: true,
      totalPaise: true,
      shipName: true,
      shipPhone: true,
      shipLine1: true,
      shipLine2: true,
      shipLandmark: true,
      shipCity: true,
      shipState: true,
      shipPincode: true,
      user: { select: { name: true, phone: true, deliveryPhone: true } },
      lines: {
        orderBy: { id: "asc" },
        select: { title: true, variantLabel: true, qty: true, storeId: true, linePaise: true },
      },
      payments: {
        select: { status: true, refunds: { select: { status: true } } },
      },
    },
  });
  if (!order) return null;

  const itemsByStore = new Map<string, { items: string; quantities: string; subtotalPaise: number }>();
  const storeIds = [...new Set(order.lines.map((line) => line.storeId).filter((id): id is string => id !== null))];
  for (const storeId of storeIds) {
    const own = order.lines.filter((line) => line.storeId === storeId);
    itemsByStore.set(storeId, {
      items: formatItems(own),
      quantities: formatQuantities(own),
      subtotalPaise: own.reduce((sum, line) => sum + line.linePaise, 0),
    });
  }

  const captured = order.payments.some((payment) => payment.status === "CAPTURED");

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    customerName: order.user.name ?? order.shipName,
    /* The *account's* number, not the shipping one, and resolved through
       the same `deliveryPhoneFor` precedence checkout uses: a verified
       line beats a typed one. Falls back to the order's own shipping
       number, which for a signed-in order is normally the same value. */
    customerPhone: deliveryPhoneFor(order.user) ?? order.shipPhone ?? null,
    totalPaise: order.totalPaise,
    paymentStatusLabel: captured ? "Paid" : "Payment pending",
    wasPlaced: captured,
    deliveryAddress: formatAddress(order),
    allItems: formatItems(order.lines),
    itemsByStore,
    refundNote: cancellationNote(order.payments),
  };
}

/** ---- Event keys --------------------------------------------------------- */

/**
 * What makes a send safe to repeat.
 *
 * `{reference}:{TYPE}` for a customer message — one per order per
 * milestone, forever — with the store code appended for a vendor
 * message, because two vendors on one order must each be told exactly
 * once. Built here rather than at each call site so that two callers of
 * the same milestone (the Razorpay webhook and the payment reconciler,
 * which settle identically) cannot produce two different keys for the
 * same event and send the customer the same message twice.
 */
export function customerEventKey(reference: string, type: WhatsAppMessageType): string {
  return `${reference}:${type}`;
}

export function vendorEventKey(reference: string, storeCode: string, fulfilmentId: string): string {
  /* The fulfilment id is in the key as well as the store code, because
     `storeCode` is a snapshot that can read `unknown` for a store row
     that has gone away — two such legs on one order would otherwise
     collide and the second vendor would never be messaged. */
  return `${reference}:NEW_VENDOR_ORDER:${storeCode}:${fulfilmentId}`;
}

/** ---- Order placed ------------------------------------------------------- */

/**
 * Everything that happens the moment an order is really paid for.
 *
 * Called from the three places a payment can settle — the Razorpay
 * webhook, the payment reconciler that recovers a lost delivery, and the
 * staff "mark payment received" action — and from nowhere else. In
 * particular **not** from the browser: the confirmation screen's
 * `POST /api/v1/checkout/verify` proves Razorpay replied, not that money
 * moved, and a customer closing the tab must still get their message.
 * See the doc comment on that route.
 *
 * Order of work, and why:
 *
 *  1. **Fulfilments first.** The vendor message carries a dispatch link,
 *     and the link is the fulfilment's token. No row, no link.
 *  2. **Customer, then vendors.** If the process dies between them the
 *     customer has been told their order exists, which is the message
 *     that matters most, and the vendor's is recoverable from the admin
 *     page. The other order round is not.
 *  3. **Sequentially, not in parallel.** Meta rate-limits per number and
 *     a handful of messages is not worth the concurrency; more to the
 *     point, `Promise.all` would make one rejection hide the others, and
 *     every one of these needs its own row.
 *
 * Idempotent end to end: `createFulfilmentsForOrder` is a
 * `skipDuplicates` insert and every send is keyed, so a redelivered
 * `payment.captured` creates nothing and sends nothing.
 */
export async function onOrderPlaced(orderId: string): Promise<void> {
  try {
    const fulfilments = await createFulfilmentsForOrder(orderId);
    const context = await loadOrderContext(orderId);
    if (!context) return;

    await sendOrderMessage({
      orderId: context.id,
      recipientType: "CUSTOMER",
      recipientPhone: context.customerPhone,
      messageType: "ORDER_PLACED",
      eventKey: customerEventKey(context.reference, "ORDER_PLACED"),
      message: {
        type: "ORDER_PLACED",
        vars: {
          customerName: context.customerName,
          orderId: context.reference,
          orderItems: context.allItems,
          totalAmount: amount(context.totalPaise),
          deliveryAddress: context.deliveryAddress,
        },
      },
    });

    for (const fulfilment of fulfilments) {
      await sendVendorOrder(context, fulfilment);
    }
  } catch (error) {
    console.error("[whatsapp] order-placed notifications failed", { orderId, error });
  }
}

/**
 * The same thing, for a caller that only knows the gateway's order id.
 *
 * Both settlement paths — the Razorpay webhook and the reconciler that
 * recovers a lost delivery — hold a `providerOrderId` and nothing else,
 * and `Payment.providerOrderId` is unique, so this is one indexed read
 * rather than a reason for either of them to learn how orders are
 * shaped. Swallows a miss for the same reason `notifyPaymentSettled`
 * does: a capture for a gateway order this database has never heard of
 * is already logged by the webhook, and there is nobody to notify.
 */
export async function onOrderPlacedForGatewayOrder(providerOrderId: string): Promise<void> {
  try {
    const payment = await db.payment.findUnique({
      where: { providerOrderId },
      select: { orderId: true },
    });
    if (!payment) return;
    await onOrderPlaced(payment.orderId);
  } catch (error) {
    console.error("[whatsapp] could not resolve a settled order", { providerOrderId, error });
  }
}

/**
 * One vendor's new-order message — their own items only.
 *
 * `itemsByStore` is keyed by the store the lines reserved from, so a
 * vendor is physically incapable of being sent another vendor's lines
 * here: there is no code path that reads the whole order's items into a
 * vendor message. The customer still gets the complete order.
 */
async function sendVendorOrder(context: OrderContext, fulfilment: CreatedFulfilment): Promise<void> {
  const own = context.itemsByStore.get(fulfilment.storeId);
  /* A fulfilment whose store has no lines cannot happen —
     `createFulfilmentsForOrder` derives the store list *from* the lines —
     but a vendor message with an empty picking list would be worse than
     none, so it is guarded rather than assumed. */
  if (!own) return;

  await sendOrderMessage({
    orderId: context.id,
    fulfilmentId: fulfilment.id,
    recipientType: "VENDOR",
    recipientPhone: fulfilment.vendorPhone,
    messageType: "NEW_VENDOR_ORDER",
    eventKey: vendorEventKey(context.reference, fulfilment.storeCode, fulfilment.id),
    message: {
      type: "NEW_VENDOR_ORDER",
      vars: {
        orderId: context.reference,
        customerName: context.customerName,
        /* The number on the parcel, so the rider can call ahead. */
        customerPhone: context.customerPhone ?? "not on file",
        orderItems: own.items,
        quantities: own.quantities,
        /* This store's share, not the order total — telling a vendor who
           is sending one of five items that the order is worth ₹40,000
           is how a dispute starts. */
        totalAmount: amount(own.subtotalPaise),
        paymentStatus: context.paymentStatusLabel,
        deliveryAddress: context.deliveryAddress,
        dispatchPath: vendorDispatchUrl(fulfilment.actionToken),
      },
    },
  });
}

/**
 * The vendor's one-tap link.
 *
 * Absolute, because it is tapped from inside WhatsApp where a relative
 * path means nothing. `siteOrigin()` is the same chain the app's Open
 * Graph tags use, so a preview deployment's links point at the preview
 * rather than at production.
 */
export function vendorDispatchUrl(actionToken: string): string {
  return new URL(`/vendor/orders/${actionToken}`, siteOrigin()).toString();
}

/** ---- Status milestones -------------------------------------------------- */

/**
 * Which message each status produces, and `null` for every status that
 * produces none.
 *
 * A `Record` over the whole enum rather than a `switch` with a default,
 * so a status added to the schema has to be given an answer here
 * explicitly. The nulls are the specification, not an oversight:
 *
 *  - `PAID` is absent because `onOrderPlaced` owns that moment — it also
 *    has to create fulfilments and message vendors, which a status
 *    notifier has no business doing.
 *  - `PENDING_PAYMENT` and `FAILED` are a checkout in progress. A
 *    customer mid-payment does not need a WhatsApp about it.
 *  - `CONFIRMED`, `PROCESSING` and `PACKED` are the retired internal
 *    statuses. Nothing writes them any more, and nothing would be sent
 *    if it did: these were the "accepted / preparing / ready" messages,
 *    and their absence here is the point.
 *  - `REFUND_PENDING` and `REFUNDED` describe money moving back. The
 *    existing refund implementation owns that conversation; inventing a
 *    WhatsApp for it would be a promise this app cannot keep.
 */
const MESSAGE_FOR_STATUS: Record<OrderStatus, WhatsAppMessageType | null> = {
  PENDING_PAYMENT: null,
  PAID: null,
  FAILED: null,
  CONFIRMED: null,
  PROCESSING: null,
  PACKED: null,
  DISPATCHED: "ORDER_DISPATCHED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "ORDER_DELIVERED",
  CANCELLED: "ORDER_CANCELLED",
  REFUND_PENDING: null,
  REFUNDED: null,
};

export function messageTypeForStatus(status: OrderStatus): WhatsAppMessageType | null {
  return MESSAGE_FOR_STATUS[status];
}

/**
 * Tells the customer about a status their order has just reached.
 *
 * Called after the transition's own transaction has committed, never
 * inside it — the same rule `notifyOrderStatus` follows for the bell
 * icon, and for the same reason: a message sent from inside a
 * transaction that then rolls back is a message about something that
 * never happened.
 *
 * A no-op for every status `MESSAGE_FOR_STATUS` has no message for, which
 * is most of them.
 */
export async function notifyCustomerOfStatus(input: {
  orderId: string;
  status: OrderStatus;
}): Promise<void> {
  const messageType = messageTypeForStatus(input.status);
  if (!messageType) return;

  try {
    const context = await loadOrderContext(input.orderId);
    if (!context) return;

    /* An order that was never paid for was never placed, and the
       customer was never told it existed — so there is nothing to tell
       them has been cancelled. This is the one status whose message has
       to be suppressed rather than sent: every other status in
       `MESSAGE_FOR_STATUS` is only reachable from a paid order, but
       `CANCELLED` is reachable straight from `PENDING_PAYMENT`, which is
       where abandoned checkouts live. See `wasPlaced`. */
    if (input.status === "CANCELLED" && !context.wasPlaced) return;

    const message = buildCustomerStatusMessage(messageType, context);
    if (!message) return;

    await sendOrderMessage({
      orderId: context.id,
      recipientType: "CUSTOMER",
      recipientPhone: context.customerPhone,
      messageType,
      eventKey: customerEventKey(context.reference, messageType),
      message,
    });
  } catch (error) {
    console.error("[whatsapp] status notification failed", {
      orderId: input.orderId,
      status: input.status,
      error,
    });
  }
}

/** The three one-variable templates and the cancellation, from a context. */
function buildCustomerStatusMessage(
  messageType: WhatsAppMessageType,
  context: OrderContext,
): WhatsAppMessage | null {
  switch (messageType) {
    case "ORDER_DISPATCHED":
      return { type: "ORDER_DISPATCHED", vars: { orderId: context.reference } };
    case "OUT_FOR_DELIVERY":
      return { type: "OUT_FOR_DELIVERY", vars: { orderId: context.reference } };
    case "ORDER_DELIVERED":
      return { type: "ORDER_DELIVERED", vars: { orderId: context.reference } };
    case "ORDER_CANCELLED":
      return {
        type: "ORDER_CANCELLED",
        vars: { orderId: context.reference, refundNote: context.refundNote },
      };
    case "ORDER_PLACED":
      return {
        type: "ORDER_PLACED",
        vars: {
          customerName: context.customerName,
          orderId: context.reference,
          orderItems: context.allItems,
          totalAmount: amount(context.totalPaise),
          deliveryAddress: context.deliveryAddress,
        },
      };
    /* A vendor message cannot be rebuilt from an order alone — it needs
       the fulfilment whose token goes in the button — so it is handled by
       `retryOrderNotification` below rather than here. */
    case "NEW_VENDOR_ORDER":
      return null;
  }
}

/** ---- Retry -------------------------------------------------------------- */

/** The admin asked to retry a row that is not in a retryable state. */
export class NotificationNotRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationNotRetryableError";
  }
}

/** The notification id did not match anything. */
export class NotificationNotFoundError extends Error {
  constructor() {
    super("No such notification");
    this.name = "NotificationNotFoundError";
  }
}

/**
 * Re-sends one failed message, from the admin order page.
 *
 * The message is **rebuilt from the order as it is now**, not replayed
 * from a stored payload. A notification that failed because a phone
 * number was missing is retried after the number is filled in, and it has
 * to pick the new number up; a stored body would send the old one. The
 * side effect is that a retried message carries today's address and
 * today's total, which is the honest thing for a message whose whole
 * purpose is to tell somebody the current state.
 *
 * Reuses the existing row rather than writing a new one — the admin is
 * retrying *this* message, so `attempts` goes up, `eventKey` does not
 * change, and the order page keeps one line per message instead of
 * growing a new one per attempt. `claimRow` in
 * `whatsapp-notifications.ts` is what performs that reuse, and the
 * guarded FAILED → RETRYING move there is what stops two admins
 * double-sending.
 *
 * Unlike everything else in this module, this one **throws**: it is
 * called from a staff route with a person waiting on the answer, and
 * "nothing happened, no idea why" is not an acceptable response to a
 * button press. The route turns each error into its own message.
 */
export async function retryOrderNotification(notificationId: string): Promise<void> {
  const row = await db.whatsAppNotification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      orderId: true,
      status: true,
      messageType: true,
      recipientType: true,
      eventKey: true,
      fulfilmentId: true,
      fulfilment: { select: { id: true, storeId: true, storeCode: true, vendorPhone: true, actionToken: true } },
    },
  });
  if (!row) throw new NotificationNotFoundError();

  if (row.status === "SENT") {
    throw new NotificationNotRetryableError(
      "This message was sent successfully. Retrying would send it a second time.",
    );
  }
  if (row.status === "RETRYING") {
    throw new NotificationNotRetryableError("A retry of this message is already in flight.");
  }

  const context = await loadOrderContext(row.orderId);
  if (!context) throw new NotificationNotFoundError();

  if (row.messageType === "NEW_VENDOR_ORDER") {
    if (!row.fulfilment) {
      throw new NotificationNotRetryableError(
        "The vendor assignment this message belonged to is no longer on the order.",
      );
    }
    /* Re-read off the *store*, not the frozen snapshot: the usual reason
       a vendor message failed is that nobody had filled a number in, and
       the whole point of the retry is to use the one they have now. */
    const store = await db.store.findUnique({
      where: { id: row.fulfilment.storeId },
      select: { whatsappPhone: true },
    });
    const phone = store?.whatsappPhone ?? row.fulfilment.vendorPhone;

    await sendVendorOrder(context, {
      id: row.fulfilment.id,
      storeId: row.fulfilment.storeId,
      storeCode: row.fulfilment.storeCode,
      storeName: "",
      vendorPhone: phone,
      actionToken: row.fulfilment.actionToken,
    });
    return;
  }

  const message = buildCustomerStatusMessage(row.messageType, context);
  if (!message) {
    throw new NotificationNotRetryableError("This message type cannot be rebuilt.");
  }

  await sendOrderMessage({
    orderId: context.id,
    fulfilmentId: row.fulfilmentId,
    recipientType: row.recipientType,
    recipientPhone: context.customerPhone,
    messageType: row.messageType,
    eventKey: row.eventKey,
    message,
  });
}
