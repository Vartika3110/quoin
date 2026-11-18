import { randomBytes } from "node:crypto";
import { Prisma, type Fulfilment, type OrderFulfilmentStatus, type OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { Paise } from "@/lib/types/catalog";

/**
 * Vendor fulfilment — which vendor has to pick what, and whether they
 * have.
 *
 * A Quoin basket can span vendors. `Product.vendorId` is per product, so
 * a basket of taps from one supplier and tiles from another is two
 * people who each have to be told, each about their own items — and the
 * failure this module exists to prevent is telling a customer their
 * order has been dispatched because one of two vendors sent their half.
 *
 * The customer-facing lifecycle is unchanged and stays four stages long
 * (`src/lib/orders/lifecycle.ts`). Vendor-level state is internal: the
 * order only reaches `DISPATCHED` when **every** outstanding leg has,
 * and nothing here writes `Order.status` itself —
 * `dispatchOrderLeg` (`src/lib/data/order-dispatch.ts`) reports whether
 * the roll-up condition is met and takes the ordinary transition through
 * `transitionOrderStatus`, so there is exactly one status-writing path in
 * the app rather than two.
 */

/** ---- Which vendor, and on what number ---------------------------------- */

/**
 * The number a vendor's new-order message goes to.
 *
 * `whatsappPhone` where they have given one, else the shop's `phone`.
 * The fallback is the point of the column being nullable: a vendor whose
 * shop number *is* their WhatsApp needs nothing filled in, and only one
 * who has neither is unreachable — which is recorded as a failed
 * notification rather than silently skipped.
 */
export function vendorWhatsAppNumber(vendor: {
  whatsappPhone: string | null;
  phone: string;
}): string | null {
  return vendor.whatsappPhone?.trim() || vendor.phone?.trim() || null;
}

/** What staff call them: the trade name where there is one. */
export function vendorDisplayName(vendor: { tradeName: string; legalName: string }): string {
  return vendor.tradeName.trim() || vendor.legalName;
}

/** ---- Creation ------------------------------------------------------------ */

/**
 * 32 bytes of CSPRNG as hex — the vendor's only credential.
 *
 * `randomBytes`, not `Math.random`, for the reason `generateReference`
 * gives: this token is the whole of the authorisation on a dispatch
 * action, so it must not be derivable from another one issued the same
 * second. Base16 rather than base64url because it goes in a URL that a
 * vendor may retype off a phone screen, and hex has no case or `-_`
 * ambiguity.
 */
function newActionToken(): string {
  return randomBytes(32).toString("hex");
}

export interface CreatedFulfilment {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorPhone: string | null;
  actionToken: string;
}

/**
 * Creates one fulfilment per vendor this order has to be picked from.
 *
 * Called once, immediately after the payment settles — never at
 * checkout. A `PENDING_PAYMENT` order has no vendor work in it: asking a
 * supplier to pick a basket that was abandoned at the gateway is the one
 * thing a vendor notification must never do.
 *
 * The vendor is resolved through the frozen `OrderLine.productSlug`, not
 * stored on the line: `Product.vendorId` is the live answer to "who
 * supplies this", the products still exist at the moment a payment
 * settles, and the vendor identity that matters afterwards is snapshotted
 * onto the row here. A line whose product has gone away, or which carries
 * no vendor at all, simply contributes no fulfilment.
 *
 * **An order with no vendors is normal, not an error.** Much of the
 * catalogue was imported before there was a vendor to point at (see
 * `Product.vendorId`), so plenty of orders have none. Those are Quoin's
 * own to dispatch, and the admin page says so rather than showing an
 * empty vendor card.
 *
 * Idempotent by construction. `(orderId, vendorId)` is unique and the
 * create is `skipDuplicates`, so a redelivered `payment.captured` — or
 * the reconciler settling the same payment the webhook also settled —
 * adds nothing and, critically, does not mint a second `actionToken` that
 * would make the first vendor's WhatsApp link stop working.
 */
export async function createFulfilmentsForOrder(orderId: string): Promise<CreatedFulfilment[]> {
  const lines = await db.orderLine.findMany({
    where: { orderId },
    select: { productSlug: true },
  });
  if (lines.length === 0) return [];

  const slugs = [...new Set(lines.map((line) => line.productSlug))];
  const products = await db.product.findMany({
    where: { slug: { in: slugs }, vendorId: { not: null } },
    select: {
      vendorId: true,
      vendor: { select: { id: true, legalName: true, tradeName: true, phone: true, whatsappPhone: true } },
    },
  });

  const vendors = new Map<string, { name: string; phone: string | null }>();
  for (const product of products) {
    if (!product.vendor) continue;
    vendors.set(product.vendor.id, {
      name: vendorDisplayName(product.vendor),
      phone: vendorWhatsAppNumber(product.vendor),
    });
  }
  if (vendors.size === 0) return [];

  await db.orderFulfilment.createMany({
    data: [...vendors].map(([vendorId, vendor]) => ({
      orderId,
      vendorId,
      vendorName: vendor.name,
      vendorPhone: vendor.phone,
      actionToken: newActionToken(),
    })),
    /* The idempotency. A second settlement of the same payment finds
       every row already there and adds none. */
    skipDuplicates: true,
  });

  return db.orderFulfilment.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      vendorId: true,
      vendorName: true,
      vendorPhone: true,
      actionToken: true,
    },
  });
}

/**
 * Which of an order's lines belong to which vendor.
 *
 * One query, returning a map from vendor id to the slugs they supply.
 * Used to build each vendor's own picking list without ever reading the
 * whole order's items into a vendor's message.
 */
export async function vendorSlugsForOrder(orderId: string): Promise<Map<string, Set<string>>> {
  const lines = await db.orderLine.findMany({
    where: { orderId },
    select: { productSlug: true },
  });
  const slugs = [...new Set(lines.map((line) => line.productSlug))];
  if (slugs.length === 0) return new Map();

  const products = await db.product.findMany({
    where: { slug: { in: slugs }, vendorId: { not: null } },
    select: { slug: true, vendorId: true },
  });

  const byVendor = new Map<string, Set<string>>();
  for (const product of products) {
    if (!product.vendorId) continue;
    const set = byVendor.get(product.vendorId) ?? new Set<string>();
    set.add(product.slug);
    byVendor.set(product.vendorId, set);
  }
  return byVendor;
}

/** ---- Reads --------------------------------------------------------------- */

export interface FulfilmentLine {
  title: string;
  variantLabel: string;
  sku: string;
  qty: number;
  unitPricePaise: Paise;
  linePaise: Paise;
  fulfilment: Fulfilment;
}

/**
 * Where this leg is going, and who to call about it.
 *
 * Read off the order's own frozen `ship*` columns, not the customer's
 * account — a vendor needs the address the order says it is going to,
 * and nothing more about the person than the name and number on the
 * parcel. There is deliberately no email, no account id and no order
 * history here: this object is rendered on a page whose only credential
 * is a link, so what it cannot carry cannot leak.
 */
export interface FulfilmentDelivery {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface FulfilmentDetail {
  id: string;
  orderId: string;
  orderReference: string;
  /** The order's own status, so a vendor page can say "cancelled" rather
      than offering a button that will be refused. */
  orderStatus: OrderStatus;
  delivery: FulfilmentDelivery;
  vendorId: string;
  vendorName: string;
  vendorPhone: string | null;
  status: OrderFulfilmentStatus;
  dispatchedAt: Date | null;
  /** Null when the vendor dispatched it themselves — see the column's
      own comment. Not "unknown". */
  dispatchedByName: string | null;
  createdAt: Date;
  /** This vendor's lines only. Never the whole order. */
  lines: FulfilmentLine[];
  /** This vendor's share, which is not the order total on a split order. */
  subtotalPaise: Paise;
}

/**
 * The projection both the vendor's own page and the admin order page
 * read.
 *
 * `lines` is filtered to the slugs this fulfilment's vendor supplies, and
 * that filtering is the security boundary as much as the presentation: a
 * vendor holding a token for vendor A must not be shown what vendor B is
 * sending, or the customer's other items, and the cheapest way to
 * guarantee that is for the only query that builds their page to be
 * incapable of selecting anything else.
 */
async function projectFulfilment(
  where: Prisma.OrderFulfilmentWhereUniqueInput,
): Promise<FulfilmentDetail | null> {
  const row = await db.orderFulfilment.findUnique({
    where,
    select: {
      id: true,
      orderId: true,
      vendorId: true,
      vendorName: true,
      vendorPhone: true,
      status: true,
      dispatchedAt: true,
      createdAt: true,
      dispatchedBy: { select: { name: true, phone: true } },
      order: {
        select: {
          reference: true,
          status: true,
          shipName: true,
          shipPhone: true,
          shipLine1: true,
          shipLine2: true,
          shipLandmark: true,
          shipCity: true,
          shipState: true,
          shipPincode: true,
        },
      },
    },
  });
  if (!row) return null;

  const slugs = (await vendorSlugsForOrder(row.orderId)).get(row.vendorId) ?? new Set<string>();

  const lines = slugs.size
    ? await db.orderLine.findMany({
        where: { orderId: row.orderId, productSlug: { in: [...slugs] } },
        orderBy: { id: "asc" },
        select: {
          title: true,
          variantLabel: true,
          sku: true,
          qty: true,
          unitPricePaise: true,
          linePaise: true,
          fulfilment: true,
        },
      })
    : [];

  return {
    id: row.id,
    orderId: row.orderId,
    orderReference: row.order.reference,
    orderStatus: row.order.status,
    delivery: {
      name: row.order.shipName,
      phone: row.order.shipPhone,
      line1: row.order.shipLine1,
      line2: row.order.shipLine2,
      landmark: row.order.shipLandmark,
      city: row.order.shipCity,
      state: row.order.shipState,
      pincode: row.order.shipPincode,
    },
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    vendorPhone: row.vendorPhone,
    status: row.status,
    dispatchedAt: row.dispatchedAt,
    dispatchedByName: row.dispatchedBy?.name ?? row.dispatchedBy?.phone ?? null,
    createdAt: row.createdAt,
    lines,
    subtotalPaise: lines.reduce((sum, line) => sum + line.linePaise, 0),
  };
}

/** One leg, by the token in the vendor's WhatsApp link. */
export function getFulfilmentByToken(token: string): Promise<FulfilmentDetail | null> {
  /* A token of the wrong shape cannot match anything, and short-
     circuiting keeps a long query string out of the database. */
  if (!/^[0-9a-f]{64}$/.test(token)) return Promise.resolve(null);
  return projectFulfilment({ actionToken: token });
}

/** One leg, by id — the admin page's own dispatch action. */
export function getFulfilmentById(id: string): Promise<FulfilmentDetail | null> {
  return projectFulfilment({ id });
}

/** Every leg of one order, for the admin page's vendor cards. */
export async function listOrderFulfilments(orderId: string): Promise<FulfilmentDetail[]> {
  const rows = await db.orderFulfilment.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const details = await Promise.all(rows.map((row) => getFulfilmentById(row.id)));
  return details.filter((detail): detail is FulfilmentDetail => detail !== null);
}

/** ---- Writes -------------------------------------------------------------- */

/** The token matched nothing, or it matched a leg of a cancelled order. */
export class FulfilmentNotFoundError extends Error {
  constructor() {
    super("That dispatch link is not valid any more.");
    this.name = "FulfilmentNotFoundError";
  }
}

/** The leg is not in a state a dispatch can act on. */
export class FulfilmentNotDispatchableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FulfilmentNotDispatchableError";
  }
}

export interface DispatchFulfilmentResult {
  fulfilmentId: string;
  orderId: string;
  orderReference: string;
  vendorName: string;
  /** False when this exact leg had already been dispatched — the vendor
      tapped their link twice, or two staff clicked at once. The caller
      treats it as success and sends nothing: see rule 3 in
      `src/lib/data/whatsapp-notifications.ts`. */
  changed: boolean;
  /** True when this dispatch was the last outstanding leg, so the *order*
      should now move to DISPATCHED. Reported, never acted on here. */
  allDispatched: boolean;
}

/**
 * Marks one vendor's leg dispatched.
 *
 * Guarded exactly like every other status write in this app: the claim is
 * a conditional `updateMany` re-asserting `status: PENDING`, never a
 * plain `update` by id. A vendor double-tapping their WhatsApp button and
 * a staff member clicking Dispatch on the admin page at the same moment
 * both pass any read-then-check; only one can match the guard, and the
 * loser is told `changed: false` rather than writing a second
 * `dispatchedAt` over the first or triggering a second customer message.
 *
 * `allDispatched` is computed **inside the same transaction** as the
 * claim. Computed outside it, two vendors finishing simultaneously could
 * each see one leg still pending and neither would advance the order —
 * the order would sit in PAID with every leg dispatched, which is the
 * exact bug this table was introduced to avoid in the other direction.
 */
export async function dispatchFulfilment(input: {
  fulfilmentId: string;
  /** The staff account acting on a vendor's behalf, or null when the
      vendor used their own link. */
  actorUserId: string | null;
}): Promise<DispatchFulfilmentResult> {
  const existing = await db.orderFulfilment.findUnique({
    where: { id: input.fulfilmentId },
    select: {
      id: true,
      status: true,
      vendorName: true,
      orderId: true,
      order: { select: { reference: true, status: true } },
    },
  });
  if (!existing) throw new FulfilmentNotFoundError();

  if (existing.order.status === "CANCELLED") {
    throw new FulfilmentNotDispatchableError(
      "This order has been cancelled. Please do not send it.",
    );
  }
  if (existing.status === "CANCELLED") {
    throw new FulfilmentNotDispatchableError(
      "This part of the order has been cancelled. Please do not send it.",
    );
  }

  const base = {
    fulfilmentId: existing.id,
    orderId: existing.orderId,
    orderReference: existing.order.reference,
    vendorName: existing.vendorName,
  };

  if (existing.status === "DISPATCHED") {
    /* Already done. Not an error — the vendor pressed the button twice,
       or the page was reloaded — and `allDispatched` still has to be
       answered truthfully, because the *first* dispatch may have failed
       to advance the order (a WhatsApp or transition error after the
       claim) and this is the call that notices. */
    const outstanding = await db.orderFulfilment.count({
      where: { orderId: existing.orderId, status: "PENDING" },
    });
    return { ...base, changed: false, allDispatched: outstanding === 0 };
  }

  return db.$transaction(async (tx) => {
    const claimed = await tx.orderFulfilment.updateMany({
      where: { id: existing.id, status: "PENDING" },
      data: {
        status: "DISPATCHED",
        dispatchedAt: new Date(),
        dispatchedByUserId: input.actorUserId,
      },
    });

    if (claimed.count === 0) {
      /* Somebody else claimed it between the read and the write. Report
         it as the no-op it is, with the roll-up still answered. */
      const outstanding = await tx.orderFulfilment.count({
        where: { orderId: existing.orderId, status: "PENDING" },
      });
      return { ...base, changed: false, allDispatched: outstanding === 0 };
    }

    /* Inside the transaction, after the claim — so the count includes
       this leg's own move and two concurrent final dispatches cannot
       both read "one still pending". */
    const outstanding = await tx.orderFulfilment.count({
      where: { orderId: existing.orderId, status: "PENDING" },
    });

    return { ...base, changed: true, allDispatched: outstanding === 0 };
  });
}

/**
 * Marks every outstanding leg of a cancelled order cancelled too.
 *
 * Called from the cancellation path after the order's own transition has
 * committed. Deliberately leaves a leg that was already DISPATCHED alone:
 * that vendor did send their items, and rewriting that to "cancelled"
 * would make the record lie about what left the building.
 */
export async function cancelOutstandingFulfilments(orderId: string): Promise<number> {
  const result = await db.orderFulfilment.updateMany({
    where: { orderId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  return result.count;
}

/**
 * Whether every leg of this order has been dispatched — the roll-up
 * condition, asked outside a dispatch (by the admin page, say).
 *
 * An order with no legs answers `false`: there is nothing to roll up, and
 * staff dispatch it through the ordinary status control instead. Saying
 * `true` would make an empty vendor list look like a completed one.
 */
export async function allFulfilmentsDispatched(orderId: string): Promise<boolean> {
  const [total, outstanding] = await Promise.all([
    db.orderFulfilment.count({ where: { orderId } }),
    db.orderFulfilment.count({ where: { orderId, status: "PENDING" } }),
  ]);
  return total > 0 && outstanding === 0;
}
