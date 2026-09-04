import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { REFERENCE_ATTEMPTS, generateReference } from "@/lib/reference";
import { quoteCart, type Quote } from "@/lib/data/checkout";
import type { Paise } from "@/lib/types/catalog";

/**
 * Orders.
 *
 * The one module in this app that writes something a customer can lose
 * money over, so two rules run through all of it:
 *
 * **The browser never states an amount.** It sends slugs, variant ids and
 * quantities — the same shape `/checkout/quote` takes — and every rupee
 * is recomputed here by `quoteCart` against the live catalogue at the
 * moment the order is written. A request claiming a total is not
 * validated against the catalogue; the total it claims is discarded.
 *
 * **Nothing here is derived at read time.** Prices, names, tax rates and
 * the delivery address are all copied onto the order. The catalogue is
 * re-importable and editable by staff, and an invoice that restates
 * itself when a price is corrected next quarter is not an invoice.
 */

const REFERENCE_PREFIX = "QO";

/** ---- Tax ---------------------------------------------------------------- */

/**
 * GST is added **on top of** the line, not extracted from it.
 *
 * This is the assumption the storefront already makes out loud: the
 * checkout summary lists GST as a separate row reading "Added on the
 * invoice", and the cart says taxes are calculated at checkout. Prices in
 * the catalogue are therefore tax-exclusive.
 *
 * Worth knowing that this is a claim about the *source data*, not a
 * choice this function is free to make. Indian MRPs are inclusive by law,
 * so if any part of the catalogue was imported from listed MRPs without
 * the tax being stripped, this adds it a second time and overcharges by
 * the slab. Changing the direction is changing this function; finding out
 * which is true is a question for the catalogue, not for the code.
 *
 * Rounded half-up to the paise, per line rather than on the subtotal,
 * because a mixed basket spans four slabs and there is no single rate to
 * apply to a total. Per-line is also what a GST invoice has to show.
 */
export function taxForLine(linePaise: Paise, gstRatePct: number): Paise {
  return Math.round((linePaise * gstRatePct) / 100);
}

/** ---- Writes ------------------------------------------------------------- */

export interface OrderLineInput {
  productSlug: string;
  variantId: string;
  qty: number;
}

export interface CreateOrderInput {
  userId: string;
  isPro: boolean;
  lines: OrderLineInput[];
  /** Must belong to `userId` — the caller is responsible for proving it. */
  addressId: string;
  /** Who takes delivery. Defaults to the account's own name and phone. */
  shipName: string;
  shipPhone: string;
}

export interface CreatedOrder {
  id: string;
  reference: string;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  /** The re-priced basket, so the caller can show what moved. */
  quote: Quote;
}

/**
 * Thrown when the basket cannot become an order at all.
 *
 * Distinct from a quote that merely *changed*: a changed quote is shown
 * to the customer and they continue or do not, whereas an empty or
 * entirely unavailable basket has nothing to charge for.
 */
export class OrderNotPossibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNotPossibleError";
  }
}

/**
 * Writes a PENDING_PAYMENT order and its frozen lines.
 *
 * Returns before any gateway is involved. The order existing with no
 * payment against it is the normal resting state of an abandoned
 * checkout, and it is also the only record that the attempt happened —
 * which is why the row is written first and the gateway called second,
 * rather than the other way around.
 *
 * The whole write is one transaction: an order without its lines is a
 * charge with nothing to say what was bought.
 */
export async function createPendingOrder(
  input: CreateOrderInput,
): Promise<CreatedOrder> {
  const quote = await quoteCart(input.lines, input.isPro);

  if (quote.lines.length === 0) {
    throw new OrderNotPossibleError(
      "Nothing in this basket can be ordered right now.",
    );
  }

  /* The address is re-read here rather than trusted from the caller's
     session, and scoped to the user: an address id belonging to someone
     else must not be usable as a delivery target, and it is the kind of
     id that is trivially guessed at if it is ever exposed. */
  const address = await db.address.findFirst({
    where: { id: input.addressId, userId: input.userId },
    select: {
      id: true,
      line1: true,
      line2: true,
      landmark: true,
      city: true,
      state: true,
      pincode: true,
    },
  });

  if (!address) {
    throw new OrderNotPossibleError("That delivery address is not available.");
  }

  /* The GST slab lives on the product, and the quote does not carry it —
     it is a pricing function, and tax is an invoicing concern. One query
     for every product in the basket rather than one per line. */
  const slugs = [...new Set(quote.lines.map((l) => l.productSlug))];
  const products = await db.product.findMany({
    where: { slug: { in: slugs } },
    /* `fulfilment` is read back here rather than taken from the quote:
       the quote widens it to a string for the client, and casting that
       back to the enum on the way into the database would accept any
       string at all. Same row as the tax slab, no extra query. */
    select: { slug: true, sku: true, gstRatePct: true, fulfilment: true },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const lines = quote.lines.map((line) => {
    const product = bySlug.get(line.productSlug);

    /* `quoteCart` just priced this line off a live, active product, so a
       miss here means the row went away between two queries in the same
       request. Rare, and not something to paper over with a default rate:
       an invented tax rate on a real invoice is a compliance problem. */
    if (!product) {
      throw new OrderNotPossibleError(
        "The catalogue changed while this order was being placed. Please try again.",
      );
    }

    return {
      productSlug: line.productSlug,
      variantId: line.variantId,
      sku: product.sku,
      title: line.title,
      variantLabel: line.variantLabel,
      qty: line.qty,
      unitPricePaise: line.unitPricePaise,
      mrpPaise: line.mrpPaise,
      linePaise: line.linePaise,
      gstRatePct: product.gstRatePct,
      taxPaise: taxForLine(line.linePaise, product.gstRatePct),
      fulfilment: product.fulfilment,
    };
  });

  const subtotalPaise = lines.reduce((sum, l) => sum + l.linePaise, 0);
  const taxPaise = lines.reduce((sum, l) => sum + l.taxPaise, 0);

  /* Retry on a reference collision rather than pre-checking for one: the
     check-then-insert version is a race that two concurrent orders can
     both pass, and the unique index is the only thing that actually
     decides. P2002 is Prisma's unique-constraint violation. */
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      const order = await db.order.create({
        data: {
          reference: generateReference(REFERENCE_PREFIX),
          userId: input.userId,
          subtotalPaise,
          taxPaise,
          totalPaise: subtotalPaise + taxPaise,
          addressId: address.id,
          shipName: input.shipName,
          shipPhone: input.shipPhone,
          shipLine1: address.line1,
          shipLine2: address.line2,
          shipLandmark: address.landmark,
          shipCity: address.city,
          shipState: address.state,
          shipPincode: address.pincode,
          lines: { createMany: { data: lines } },
        },
        select: {
          id: true,
          reference: true,
          subtotalPaise: true,
          taxPaise: true,
          totalPaise: true,
        },
      });

      return { ...order, quote };
    } catch (error) {
      const collided =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        /* Only a reference clash is retryable. Any other unique index
           failing means something different is wrong, and spinning five
           times over it would just delay the real error. */
        (error.meta?.target as string[] | undefined)?.includes("reference");

      if (!collided) throw error;
    }
  }

  throw new Error("Could not allocate an order reference");
}

/**
 * Records that the customer has been handed to the gateway.
 *
 * One row per trip to checkout. Someone who abandons and comes back gets
 * a second gateway order and so a second row, which is what keeps the
 * abandoned attempt on the record rather than overwriting it.
 */
export function recordPaymentAttempt(input: {
  orderId: string;
  providerOrderId: string;
  amountPaise: Paise;
}) {
  return db.payment.create({
    data: {
      orderId: input.orderId,
      providerOrderId: input.providerOrderId,
      amountPaise: input.amountPaise,
    },
    select: { id: true },
  });
}

/** ---- Webhook settlement -------------------------------------------------- */

export type SettlementOutcome =
  /** First delivery of this event; the payment and order were updated. */
  | "recorded"
  /** Already applied. Razorpay retries, and this is the ordinary case. */
  | "duplicate"
  /** No payment row matches — not ours, or a stale test event. */
  | "unknown"
  /** Captured amount did not match the order total. Nothing was changed. */
  | "amount_mismatch";

/**
 * Marks a captured payment paid.
 *
 * Idempotent on `providerPaymentId`, which carries a unique index — the
 * database, not a prior read, is what decides whether an event has been
 * seen. Razorpay retries on any non-2xx response and can deliver the same
 * event more than once even on success, so "have I already handled this"
 * cannot be answered with a `findFirst` and a branch: two retries
 * arriving together would both pass it.
 *
 * The amount is checked before anything moves. A capture for less than
 * the order total is a discrepancy for a person to look at, not a sale to
 * complete, and marking the order paid would hide it.
 */
export async function settleCapturedPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
  method?: string;
}): Promise<SettlementOutcome> {
  const payment = await db.payment.findUnique({
    where: { providerOrderId: input.providerOrderId },
    select: {
      id: true,
      status: true,
      providerPaymentId: true,
      orderId: true,
      order: { select: { totalPaise: true, status: true } },
    },
  });

  if (!payment) return "unknown";

  if (
    payment.status === "CAPTURED" &&
    payment.providerPaymentId === input.providerPaymentId
  ) {
    return "duplicate";
  }

  if (input.amountPaise !== payment.order.totalPaise) {
    /* Recorded rather than swallowed, so the discrepancy is visible in
       the payments table and not only in a log line that scrolls away. */
    await db.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: input.providerPaymentId,
        method: input.method,
        failureReason: `Captured ${input.amountPaise} paise against an order total of ${payment.order.totalPaise} paise`,
      },
    });
    return "amount_mismatch";
  }

  try {
    /* Both rows or neither. An order marked paid whose payment row still
       says CREATED, or the reverse, is the state that makes a refund
       argument unwinnable. */
    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: input.providerPaymentId,
          status: "CAPTURED",
          method: input.method,
        },
      }),
      db.order.update({
        where: { id: payment.orderId },
        data: {
          status: "PAID",
          /* Set once. A retry of the same event must not move the time
             the money actually arrived. */
          paidAt: new Date(),
        },
      }),
    ]);
    return "recorded";
  } catch (error) {
    /* The unique index on `providerPaymentId` rejecting the write means a
       concurrent delivery of the same event won the race and has already
       done this work. That is success, not failure — returning an error
       would make Razorpay retry something already done. */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "duplicate";
    }
    throw error;
  }
}

/**
 * Records a failed attempt.
 *
 * The order is left PENDING_PAYMENT rather than moved to FAILED: the
 * customer is very often still on the checkout, about to try another
 * method, and an order that has declared itself failed underneath them is
 * one they cannot pay for. FAILED is for a person to set once an attempt
 * is genuinely abandoned.
 */
export async function recordFailedPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  method?: string;
  reason?: string;
}): Promise<SettlementOutcome> {
  const payment = await db.payment.findUnique({
    where: { providerOrderId: input.providerOrderId },
    select: { id: true, status: true },
  });

  if (!payment) return "unknown";

  /* A capture that has already landed outranks a late failure event.
     Razorpay does not guarantee delivery order, and letting an
     out-of-sequence `payment.failed` overwrite a settled capture would
     mark a paid order unpaid. */
  if (payment.status === "CAPTURED") return "duplicate";

  await db.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: input.providerPaymentId,
      status: "FAILED",
      method: input.method,
      failureReason: input.reason,
    },
  });

  return "recorded";
}
