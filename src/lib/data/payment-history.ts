import type { PaymentProvider, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { OFFLINE_METHOD_LABEL, OFFLINE_PAYMENT_METHODS, type OfflinePaymentMethod } from "@/lib/data/orders";
import type { Paise } from "@/lib/types/catalog";

/**
 * Payment history — what `/account/payments` shows, and nothing more.
 *
 * `Payment` carries columns this screen must never surface: `failureReason`
 * is the gateway's integrator-facing string (see its model comment —
 * "shown to no one"), `offlineReference` and `rawBody`-adjacent detail are
 * staff's own working notes, not a customer-facing summary. `listPaymentsForUser`
 * below selects only the six fields a transaction history actually needs,
 * so there is no later "just don't render that field" discipline for a
 * future edit of this page to get wrong — the column is never read out of
 * the database in the first place.
 */

export interface PaymentHistoryRow {
  providerPaymentId: string | null;
  provider: PaymentProvider;
  /** The gateway's own string (`upi`, `card`, …) for a RAZORPAY row, or
      the staff-picked `UPI`/`CASH`/`BANK_TRANSFER`/`CHEQUE` for an
      OFFLINE one — see `Payment.method`. */
  method: string | null;
  status: PaymentStatus;
  amountPaise: Paise;
  createdAt: Date;
  orderReference: string;
}

/**
 * The signed-in customer's own payment attempts, newest first.
 *
 * Scoped through the `order` relation (`order: { userId }`) rather than a
 * column on `Payment` itself — there is no `Payment.userId`, by design:
 * a payment belongs to an order, and an order belongs to a customer, and
 * repeating the customer's id on every payment row would be a second
 * place that ownership fact could drift from the order it is about.
 */
export async function listPaymentsForUser(userId: string): Promise<PaymentHistoryRow[]> {
  const rows = await db.payment.findMany({
    where: { order: { userId } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      providerPaymentId: true,
      provider: true,
      method: true,
      status: true,
      amountPaise: true,
      createdAt: true,
      order: { select: { reference: true } },
    },
  });

  return rows.map((row) => ({
    providerPaymentId: row.providerPaymentId,
    provider: row.provider,
    method: row.method,
    status: row.status,
    amountPaise: row.amountPaise,
    createdAt: row.createdAt,
    orderReference: row.order.reference,
  }));
}

/** ---- Pure display mappers -------------------------------------------------
 * Kept as `Record`s over the real enums, not a `switch` with a `default` —
 * the same discipline `ORDER_STATUS_LABEL` follows (`src/lib/data/order-history.ts`)
 * and for the same reason: a status added to the schema without a case
 * added here is a type error, not a blank cell on a customer's own
 * transaction history. Deliberately coarser than that module's own
 * `PAYMENT_STATUS_LABEL` ("Awaiting payment", "Authorized", …) — this
 * screen is a receipt list, not an ops view, and "Pending" says
 * everything a customer needs to know about either `CREATED` or
 * `AUTHORIZED`.
 */

const PAYMENT_STATUS_DISPLAY: Record<PaymentStatus, string> = {
  CREATED: "Pending",
  AUTHORIZED: "Pending",
  CAPTURED: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_DISPLAY[status];
}

const RAZORPAY_METHOD_LABEL: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Netbanking",
  wallet: "Wallet",
};

/**
 * The gateway's method string is free text it controls, not an enum this
 * app defines (see `Payment.method`'s model comment) — so a method this
 * table does not recognise still shows the raw string Razorpay sent
 * rather than "—", which would read as "no method" when there plainly
 * was one.
 */
export function paymentMethodLabel(provider: PaymentProvider, method: string | null): string {
  if (provider === "OFFLINE") {
    return method && (OFFLINE_PAYMENT_METHODS as readonly string[]).includes(method)
      ? OFFLINE_METHOD_LABEL[method as OfflinePaymentMethod]
      : "—";
  }
  if (!method) return "—";
  return RAZORPAY_METHOD_LABEL[method] ?? method;
}

/**
 * What a customer can quote back to support. An `OFFLINE` row never went
 * near a gateway — see `recordOfflinePayment`, `src/lib/data/orders.ts` —
 * so "Recorded by Quoin" is the honest answer where a gateway payment
 * would show its `providerPaymentId`, not a blank or an invented id.
 */
export function paymentTransactionId(provider: PaymentProvider, providerPaymentId: string | null): string {
  if (providerPaymentId) return providerPaymentId;
  return provider === "OFFLINE" ? "Recorded by Quoin" : "—";
}
