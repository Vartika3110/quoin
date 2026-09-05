import type { Fulfilment, InventoryMovementKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveServiceability, type LatLng, type ServiceableStore } from "@/lib/geo";

/**
 * The inventory engine.
 *
 * Most of the catalogue is not stock-tracked, and that is deliberate: the
 * catalogue is thousands of imported SKUs with no stock data at all, and
 * requiring an `InventoryItem` row before any of them could be sold would
 * take the whole storefront offline the moment this module ships.
 * `Product.stockTracked` is off by default, set by hand as real stock is
 * counted in, and never touched by the importers. A product with the flag
 * off sells exactly as it did before this file existed — nothing here is
 * consulted for it at all.
 *
 * Only `INSTANT` and `SCHEDULED` fulfilment ever hold stock. `BOOKABLE`
 * consumes an expert's time slot and `MADE_TO_ORDER` is cut after the
 * order is placed; neither has anything to reserve, and checking them
 * would block every made-to-order line at checkout.
 *
 * Overselling is prevented by the database, not by application code. A
 * read-then-write reservation cannot do it: two concurrent orders can
 * both read `available = 1` and both decide there is room. So the reserve
 * below is a single conditional `UPDATE`, and the *only* trustworthy
 * signal of insufficient stock is that it affected zero rows — never a
 * prior read. Prisma's `where` cannot compare two columns against each
 * other, so this has to be `$executeRaw`, and it is always parameterised
 * through tagged-template placeholders, never string-interpolated.
 */

/** Fulfilment types that ever hold stock. Everything else is sold to order. */
const STOCK_BEARING: ReadonlySet<Fulfilment> = new Set(["INSTANT", "SCHEDULED"]);

export function isStockBearing(fulfilment: Fulfilment): boolean {
  return STOCK_BEARING.has(fulfilment);
}

/**
 * The customer-facing quantity. Never stored — see the `InventoryItem`
 * model comment. A stored third column is a number that can disagree
 * with the two it summarises, and the disagreement always surfaces as a
 * customer being told something is in stock when it is not.
 */
export function availableQty(onHandQty: number, reservedQty: number): number {
  return onHandQty - reservedQty;
}

export interface MovementDelta {
  onHandDelta: number;
  reservedDelta: number;
}

/**
 * The arithmetic of each movement kind, in one place.
 *
 * `qty` is a positive magnitude for every kind except `ADJUSTMENT`, which
 * can be negative — a correction can go either way, and every other kind
 * has its direction fixed by what it means (you cannot "un-receive" stock
 * through this function; that is what `ADJUSTMENT` is for).
 *
 * `COMMIT` is the one kind that moves both counters: the stock that was
 * reserved is now actually gone, not merely unreserved, so it must leave
 * `onHandQty` at the same moment it leaves `reservedQty` — a release
 * followed by a separate deduction could be individually replayed and
 * would let a retried webhook deduct twice.
 */
export function movementDelta(
  kind: "RECEIPT" | "RESERVE" | "RELEASE" | "COMMIT" | "ADJUSTMENT" | "RETURN",
  qty: number,
): MovementDelta {
  switch (kind) {
    case "RECEIPT":
      return { onHandDelta: qty, reservedDelta: 0 };
    case "RESERVE":
      return { onHandDelta: 0, reservedDelta: qty };
    case "RELEASE":
      return { onHandDelta: 0, reservedDelta: -qty };
    case "COMMIT":
      return { onHandDelta: -qty, reservedDelta: -qty };
    case "ADJUSTMENT":
      return { onHandDelta: qty, reservedDelta: 0 };
    case "RETURN":
      return { onHandDelta: qty, reservedDelta: 0 };
  }
}

export interface OrderStockLine {
  variantId: string;
  qty: number;
  fulfilment: Fulfilment;
  stockTracked: boolean;
}

/**
 * Which lines of a basket this module has any business touching at all.
 *
 * Pure, and deliberately the single gate `reserveStockForOrder` filters
 * through — an untracked product, or a `BOOKABLE`/`MADE_TO_ORDER` line,
 * must never reach the reserve/commit/release machinery no matter how
 * the qty or store resolution would otherwise turn out. Extracted so this
 * bypass can be asserted without a database: it is a decision, not a
 * database read.
 */
export function linesRequiringStock(lines: OrderStockLine[]): OrderStockLine[] {
  return lines.filter((line) => line.stockTracked && isStockBearing(line.fulfilment));
}

/** ---- Store resolution ----------------------------------------------- */

/**
 * Decides which store a stock-bearing line reserves against, given a
 * serviceability answer already computed for the delivery address.
 *
 * Pure and side-effect free on purpose: it is the one decision in this
 * module with real business judgement in it (does this fulfilment type
 * get a fallback), and keeping it free of any database call is what lets
 * it be unit-tested without one.
 *
 * `INSTANT` has no fallback — it is the "18 minutes from a dark store"
 * promise, and a store outside its own radius cannot keep that promise no
 * matter what the schema says the default is. `SCHEDULED` is a delivered,
 * dated commitment rather than a same-day one, so a warehouse outside
 * every radius can still fulfil it — that is what `defaultStoreId` is
 * for.
 */
export function resolveStoreForStockLine(
  fulfilment: "INSTANT" | "SCHEDULED",
  serviceability: { serviceable: boolean; store: { id: string } | null },
  defaultStoreId: string | null,
): string | null {
  if (serviceability.serviceable && serviceability.store) {
    return serviceability.store.id;
  }
  if (fulfilment === "SCHEDULED") {
    return defaultStoreId;
  }
  return null;
}

/** ---- Errors ----------------------------------------------------------- */

/** Zero rows affected on the conditional reserve — the only trustworthy signal. */
export class InsufficientStockError extends Error {
  constructor(
    readonly variantId: string,
    readonly storeId: string,
  ) {
    super(`Insufficient stock for variant ${variantId} at store ${storeId}`);
    this.name = "InsufficientStockError";
  }
}

/** No store — nearest-in-radius or default — can serve this line at all. */
export class StoreUnavailableError extends Error {
  constructor(readonly variantId: string) {
    super(`No store can serve variant ${variantId} at this address`);
    this.name = "StoreUnavailableError";
  }
}

/** ---- Low-level movement primitives ------------------------------------ */

/**
 * The only place an `InventoryMovement` row is written. Every caller below
 * routes through this so "carries the resulting counters, not just the
 * delta" cannot be forgotten at one call site and not another.
 */
async function writeMovement(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    kind: "RECEIPT" | "RESERVE" | "RELEASE" | "COMMIT" | "ADJUSTMENT" | "RETURN";
    qty: number;
    onHandQty: number;
    reservedQty: number;
    orderId?: string | null;
    reason?: string | null;
    staffUserId?: string | null;
  },
) {
  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: input.inventoryItemId,
      kind: input.kind,
      qty: input.qty,
      onHandQty: input.onHandQty,
      reservedQty: input.reservedQty,
      orderId: input.orderId ?? null,
      reason: input.reason ?? null,
      staffUserId: input.staffUserId ?? null,
    },
  });
}

/**
 * Reserves `qty` units of one variant at one store.
 *
 * The `UPDATE` is the arbiter, not a read beforehand: `WHERE` compares
 * `onHandQty - reservedQty` against `qty` in the same statement that
 * increments `reservedQty`, so two concurrent reservations for the last
 * unit cannot both pass — at most one `UPDATE` can see `>= qty` still
 * true, because Postgres serialises writes to the same row. Zero rows
 * affected means insufficient stock; it is not distinguishable from "the
 * row does not exist", which is correct — an untracked reservation and a
 * tracked one with nothing counted in are the same outcome for a
 * customer.
 *
 * This is the one property this module could not unit-test without a
 * real database: that two concurrent callers against the same row cannot
 * both succeed. See the note in the test file.
 */
export async function reserveVariantStock(
  tx: Prisma.TransactionClient,
  input: { variantId: string; storeId: string; qty: number; orderId: string },
): Promise<void> {
  const affected = await tx.$executeRaw`
    UPDATE "inventory_items"
    SET "reservedQty" = "reservedQty" + ${input.qty}
    WHERE "variantId" = ${input.variantId}
      AND "storeId" = ${input.storeId}
      AND "onHandQty" - "reservedQty" >= ${input.qty}
  `;

  if (affected === 0) {
    throw new InsufficientStockError(input.variantId, input.storeId);
  }

  const item = await tx.inventoryItem.findUniqueOrThrow({
    where: { variantId_storeId: { variantId: input.variantId, storeId: input.storeId } },
    select: { id: true, onHandQty: true, reservedQty: true },
  });

  await writeMovement(tx, {
    inventoryItemId: item.id,
    kind: "RESERVE",
    qty: input.qty,
    onHandQty: item.onHandQty,
    reservedQty: item.reservedQty,
    orderId: input.orderId,
  });
}

/**
 * Gives back a reservation: payment failed and the customer moved on, the
 * reservation expired, or the order was cancelled.
 *
 * Guarded the same way the reserve is, for the same reason — not because
 * two releases of the *same* order can race in the ordinary flow, but
 * because `releaseExpiredReservations` could in principle be invoked
 * twice concurrently (two staff clicking the endpoint, a retried call).
 * Zero rows affected here is not a business outcome to swallow: it means
 * this reservation was already released or never existed, and the caller
 * asked for a release that cannot correspond to a real prior reserve —
 * see the order-level guard in `releaseExpiredReservations`, which is
 * what actually makes double-release safe in practice.
 */
export async function releaseVariantStock(
  tx: Prisma.TransactionClient,
  input: { variantId: string; storeId: string; qty: number; orderId: string },
): Promise<void> {
  const affected = await tx.$executeRaw`
    UPDATE "inventory_items"
    SET "reservedQty" = "reservedQty" - ${input.qty}
    WHERE "variantId" = ${input.variantId}
      AND "storeId" = ${input.storeId}
      AND "reservedQty" >= ${input.qty}
  `;

  if (affected === 0) {
    throw new Error(
      `Cannot release ${input.qty} of variant ${input.variantId} at store ${input.storeId}: not that much is reserved`,
    );
  }

  const item = await tx.inventoryItem.findUniqueOrThrow({
    where: { variantId_storeId: { variantId: input.variantId, storeId: input.storeId } },
    select: { id: true, onHandQty: true, reservedQty: true },
  });

  await writeMovement(tx, {
    inventoryItemId: item.id,
    kind: "RELEASE",
    qty: input.qty,
    onHandQty: item.onHandQty,
    reservedQty: item.reservedQty,
    orderId: input.orderId,
  });
}

/**
 * `payment.captured`. Moves both counters together — see `movementDelta`
 * — because the stock that was reserved is now actually gone.
 *
 * Guarded the same way: zero rows affected means this reservation was
 * already committed, which is exactly the shape a redelivered
 * `payment.captured` must not be allowed to charge twice against. In
 * practice this is unreachable in duplicate form because
 * `settleCapturedPayment` only ever calls this from inside the same
 * transaction as the `Payment` update that a unique index makes
 * idempotent — but the guard costs nothing and this function must not be
 * the one place in the module that trusts its caller.
 */
export async function commitVariantStock(
  tx: Prisma.TransactionClient,
  input: { variantId: string; storeId: string; qty: number; orderId: string },
): Promise<void> {
  const affected = await tx.$executeRaw`
    UPDATE "inventory_items"
    SET "onHandQty" = "onHandQty" - ${input.qty},
        "reservedQty" = "reservedQty" - ${input.qty}
    WHERE "variantId" = ${input.variantId}
      AND "storeId" = ${input.storeId}
      AND "reservedQty" >= ${input.qty}
  `;

  if (affected === 0) {
    throw new Error(
      `Cannot commit ${input.qty} of variant ${input.variantId} at store ${input.storeId}: not that much is reserved`,
    );
  }

  const item = await tx.inventoryItem.findUniqueOrThrow({
    where: { variantId_storeId: { variantId: input.variantId, storeId: input.storeId } },
    select: { id: true, onHandQty: true, reservedQty: true },
  });

  await writeMovement(tx, {
    inventoryItemId: item.id,
    kind: "COMMIT",
    qty: input.qty,
    onHandQty: item.onHandQty,
    reservedQty: item.reservedQty,
    orderId: input.orderId,
  });
}

/**
 * Stock arriving at a store. Staff-driven; there is no admin UI to call
 * this from yet (module 8 in the build order), so it exists as the
 * primitive that UI will call rather than as a reachable endpoint today.
 * Creates the `InventoryItem` row the first time stock is counted in for
 * a variant at a store.
 */
export async function receiveStock(input: {
  variantId: string;
  storeId: string;
  qty: number;
}): Promise<void> {
  if (input.qty <= 0) throw new Error("A receipt must be a positive quantity");

  await db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.upsert({
      where: { variantId_storeId: { variantId: input.variantId, storeId: input.storeId } },
      create: { variantId: input.variantId, storeId: input.storeId, onHandQty: input.qty },
      update: { onHandQty: { increment: input.qty } },
      select: { id: true, onHandQty: true, reservedQty: true },
    });

    await writeMovement(tx, {
      inventoryItemId: item.id,
      kind: "RECEIPT",
      qty: input.qty,
      onHandQty: item.onHandQty,
      reservedQty: item.reservedQty,
    });
  });
}

/**
 * A customer return. Kept separate from `ADJUSTMENT` — see the model
 * comment — because a return is explained by the order it came back
 * against and a correction is not explained by anything but a person.
 */
export async function returnStock(input: {
  variantId: string;
  storeId: string;
  qty: number;
  orderId: string;
}): Promise<void> {
  if (input.qty <= 0) throw new Error("A return must be a positive quantity");

  await db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.upsert({
      where: { variantId_storeId: { variantId: input.variantId, storeId: input.storeId } },
      create: { variantId: input.variantId, storeId: input.storeId, onHandQty: input.qty },
      update: { onHandQty: { increment: input.qty } },
      select: { id: true, onHandQty: true, reservedQty: true },
    });

    await writeMovement(tx, {
      inventoryItemId: item.id,
      kind: "RETURN",
      qty: input.qty,
      onHandQty: item.onHandQty,
      reservedQty: item.reservedQty,
      orderId: input.orderId,
    });
  });
}

/**
 * A staff correction — a stock count, a breakage, a miscount found on
 * audit. The only movement whose `qty` may be negative, and the only one
 * that requires a reason and a staff user: an unexplained change to a
 * number nobody can already reconstruct from an order is exactly the kind
 * of write this codebase's house style asks to be justified in the data,
 * not just in a commit message.
 */
export async function adjustStock(input: {
  variantId: string;
  storeId: string;
  qty: number;
  reason: string;
  staffUserId: string;
}): Promise<void> {
  if (input.qty === 0) throw new Error("An adjustment must actually change something");
  if (!input.reason.trim()) throw new Error("An adjustment requires a reason");

  await db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.upsert({
      where: { variantId_storeId: { variantId: input.variantId, storeId: input.storeId } },
      create: { variantId: input.variantId, storeId: input.storeId, onHandQty: Math.max(input.qty, 0) },
      update: { onHandQty: { increment: input.qty } },
      select: { id: true, onHandQty: true, reservedQty: true },
    });

    /* Both floors are checked here, after the increment and inside the
       transaction, rather than by reading the row first and deciding: a
       check-then-write is exactly the race that lets two staff — or one
       staff member and a customer's reservation landing at the same
       moment — each pass a test the other invalidates. The increment has
       already taken the row lock, so `item` is the post-write truth and
       throwing rolls the whole thing back.

       The route checks the reserved floor too, but only so it can answer
       with a readable message instead of a 500. This is the check that
       actually holds. */
    if (item.onHandQty < 0) {
      throw new Error(
        `Adjustment would take on-hand stock negative for variant ${input.variantId} at store ${input.storeId}`,
      );
    }

    if (item.onHandQty < item.reservedQty) {
      throw new InsufficientStockError(input.variantId, input.storeId);
    }

    await writeMovement(tx, {
      inventoryItemId: item.id,
      kind: "ADJUSTMENT",
      qty: input.qty,
      onHandQty: item.onHandQty,
      reservedQty: item.reservedQty,
      reason: input.reason,
      staffUserId: input.staffUserId,
    });
  });
}

/** ---- Order-level orchestration ---------------------------------------- */

/**
 * Reserves stock for every tracked, stock-bearing line of one order,
 * inside the caller's transaction.
 *
 * Resolves the store once per order, not once per line — every line in a
 * basket ships to the same delivery address, so the serviceability
 * answer and the default store are the same for all of them.
 *
 * Throws `StoreUnavailableError` or `InsufficientStockError` on the first
 * line that cannot be reserved, which aborts the whole transaction: a
 * basket where one tracked line cannot be fulfilled does not become an
 * order missing that line, it becomes no order at all, so the customer
 * sees the problem before any money moves rather than receiving a
 * partial shipment. The caller (`createPendingOrder`) is responsible for
 * translating these into the customer-facing `OrderNotPossibleError`.
 *
 * Returns the store each line reserved from — `null` for a line that
 * needed none — so the caller can freeze it onto `OrderLine.storeId` for
 * `settleCapturedPayment` and `releaseExpiredReservations` to commit or
 * release the same `InventoryItem` later.
 */
export async function reserveStockForOrder(
  tx: Prisma.TransactionClient,
  input: { orderId: string; address: LatLng; lines: OrderStockLine[] },
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  const stockLines = linesRequiringStock(input.lines);

  for (const line of input.lines) {
    if (!stockLines.includes(line)) result.set(line.variantId, null);
  }

  if (stockLines.length === 0) return result;

  /* One query for the whole order rather than one per line — every line
     ships to the same address, so the serviceability answer cannot
     differ between them. */
  const stores = await tx.store.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      lat: true,
      lng: true,
      serviceRadiusKm: true,
      baseEtaMinutes: true,
    },
  });
  const serviceability = resolveServiceability(input.address, stores as ServiceableStore[]);

  const defaultStore = await tx.store.findFirst({
    where: { isActive: true, isDefault: true },
    select: { id: true },
  });

  for (const line of stockLines) {
    /* `isStockBearing` above already narrows `fulfilment` to these two at
       runtime; TypeScript cannot see that through `Set.has`, so this
       assertion documents the invariant rather than inventing a new one. */
    const fulfilment = line.fulfilment as "INSTANT" | "SCHEDULED";
    const storeId = resolveStoreForStockLine(
      fulfilment,
      serviceability,
      defaultStore?.id ?? null,
    );

    if (!storeId) throw new StoreUnavailableError(line.variantId);

    await reserveVariantStock(tx, {
      variantId: line.variantId,
      storeId,
      qty: line.qty,
      orderId: input.orderId,
    });
    result.set(line.variantId, storeId);
  }

  return result;
}

/**
 * Commits every reserved line of one order — called from
 * `settleCapturedPayment` inside the same transaction as the `Payment`
 * and `Order` update that a unique index makes idempotent, so a
 * redelivered `payment.captured` cannot reach this twice: see the module
 * comment on `commitVariantStock`.
 */
export async function commitStockForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const lines = await tx.orderLine.findMany({
    where: { orderId, storeId: { not: null } },
    select: { variantId: true, storeId: true, qty: true },
  });

  for (const line of lines) {
    await commitVariantStock(tx, {
      variantId: line.variantId,
      storeId: line.storeId as string,
      qty: line.qty,
      orderId,
    });
  }
}

/**
 * Releases every reserved line of one order. Used by
 * `releaseExpiredReservations` below; a future cancellation endpoint
 * (there is none yet — see `docs/production-audit.md`) would call this
 * too.
 */
export async function releaseStockForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const lines = await tx.orderLine.findMany({
    where: { orderId, storeId: { not: null } },
    select: { variantId: true, storeId: true, qty: true },
  });

  for (const line of lines) {
    await releaseVariantStock(tx, {
      variantId: line.variantId,
      storeId: line.storeId as string,
      qty: line.qty,
      orderId,
    });
  }
}

/**
 * How long a `PENDING_PAYMENT` order holds its reservation before
 * `releaseExpiredReservations` will give it back. Fifteen minutes: long
 * enough to get through a UPI collect or a card 3DS round trip without
 * losing the last unit to someone else mid-payment, short enough that an
 * abandoned checkout is not sitting on real stock for hours.
 */
export const RESERVATION_WINDOW_MS = 15 * 60 * 1000;

/**
 * Releases every `PENDING_PAYMENT` order whose reservation has expired.
 *
 * Nothing in this app calls this on a timer. There is no cron
 * infrastructure here — see `docs/production-audit.md` and
 * AGENTS.md — and adding one for a single sweep is not a dependency this
 * phase takes on. This function exists and is callable; something must
 * actually call it; today that something is the staff endpoint at
 * `POST /api/v1/admin/inventory/release-expired`, invoked by hand or by
 * whatever the deploy platform's own scheduled-job feature ends up being
 * pointed at.
 *
 * Each order is claimed with its own conditional `UPDATE` before anything
 * is released, for the same reason the reserve itself is conditional:
 * this endpoint could in principle be invoked twice concurrently, and
 * without the claim both calls would see the same expired order and both
 * try to release it, taking `reservedQty` negative. Zero rows affected on
 * the claim means another caller already has it, or the order was paid
 * in the moment between this function's initial read and the claim — and
 * in both cases the right move is to do nothing, not to error.
 */
export async function releaseExpiredReservations(
  now: Date = new Date(),
): Promise<{ releasedOrders: number }> {
  const expired = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lt: now } },
    select: { id: true },
  });

  let releasedOrders = 0;

  for (const order of expired) {
    const released = await db.$transaction(async (tx) => {
      const claimed = await tx.$executeRaw`
        UPDATE "orders"
        SET "reservationExpiresAt" = NULL
        WHERE "id" = ${order.id}
          AND "status" = 'PENDING_PAYMENT'
          AND "reservationExpiresAt" IS NOT NULL
          AND "reservationExpiresAt" < ${now}
      `;

      if (claimed === 0) return false;

      await releaseStockForOrder(tx, order.id);
      return true;
    });

    if (released) releasedOrders++;
  }

  return { releasedOrders };
}

/** ---- Read-side queries (admin) ----------------------------------------
 *
 * Everything below only reads. `/admin/inventory` needs shapes nothing
 * customer-facing has ever needed — every tracked item across every
 * store, joined to its product and store name, filtered and paginated —
 * so they live beside the engine rather than bolted onto a storefront
 * query that has no reason to know about admin filters. Nothing here
 * writes, and nothing here is consulted by the reserve/commit/release
 * path above it.
 */

export const DEFAULT_INVENTORY_PAGE_SIZE = 25;
const MAX_INVENTORY_PAGE_SIZE = 100;

export interface ResolvedInventoryPage {
  page: number;
  pageSize: number;
  skip: number;
}

/**
 * Truncates to a whole number, falling back to `fallback` for `undefined`
 * or anything non-finite — but *not* for `0`. Mirrors `wholeOr` in
 * `src/lib/data/order-history.ts`: a genuinely-zero `pageSize` must clamp
 * to 1 below, not be read as "not supplied" and silently widened back to
 * the default. Kept local rather than imported — that module belongs to
 * a different phase of this build and this is a three-line rule, not a
 * shared dependency worth coupling two owners over.
 */
function wholeOr(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const truncated = Math.trunc(value);
  return Number.isFinite(truncated) ? truncated : fallback;
}

/** Pure so pagination bounds are testable without a database. */
export function resolveInventoryPage(
  page?: number,
  pageSize?: number,
): ResolvedInventoryPage {
  const boundedPageSize = Math.min(
    Math.max(1, wholeOr(pageSize, DEFAULT_INVENTORY_PAGE_SIZE)),
    MAX_INVENTORY_PAGE_SIZE,
  );
  const boundedPage = Math.max(1, wholeOr(page, 1));
  return {
    page: boundedPage,
    pageSize: boundedPageSize,
    skip: (boundedPage - 1) * boundedPageSize,
  };
}

/**
 * Below this, the stock list flags an item as low — see
 * `InventoryItem.lowStockThreshold`. Pure and exported so the predicate
 * that decides what the admin list highlights is testable without a
 * database, same as `availableQty` above it.
 */
export function isLowStock(
  onHandQty: number,
  reservedQty: number,
  lowStockThreshold: number,
): boolean {
  return availableQty(onHandQty, reservedQty) <= lowStockThreshold;
}

/**
 * Whether an adjustment of `deltaQty` can be applied without taking
 * on-hand stock below what is already reserved by live orders — that
 * stock is spoken for, and an adjustment is not the tool for taking it
 * back (a release or a cancellation is).
 *
 * This is the admin adjust route's own guard, not `adjustStock`'s: this
 * phase may add read-side helpers here but may not change what that
 * function does, so the floor is enforced by the caller, checked against
 * a read taken immediately before it calls `adjustStock`. That leaves a
 * race a concurrent second adjustment could in principle slip through —
 * acceptable for a staff-driven correction in a way it would not be for
 * the checkout reservation path, which is exactly why that path is a
 * conditional `UPDATE` instead of a read-then-write. Pure so the guard
 * itself is testable on its own.
 */
export function canApplyAdjustment(
  onHandQty: number,
  reservedQty: number,
  deltaQty: number,
): boolean {
  return onHandQty + deltaQty >= reservedQty;
}

export interface StoreOption {
  id: string;
  code: string;
  name: string;
}

/** Every active store, for a filter dropdown and the "start tracking" form. */
export async function listActiveStores(): Promise<StoreOption[]> {
  return db.store.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });
}

export interface InventoryStats {
  totalTracked: number;
  lowStock: number;
  outOfStock: number;
}

/**
 * A safety cap on how many rows a stats scan or an unfiltered list read
 * touches in application code — see the note on `listInventoryItems` for
 * why this can't be pushed into SQL. Tracked inventory is opt-in and
 * expected to be a small slice of a 3,000-product catalogue; this is a
 * backstop against that assumption being wrong, not the expected path.
 */
const MAX_SCAN_ROWS = 5000;

/** Whole-store totals, unaffected by the list's own filters — the figures
    that tell the empty state apart from a merely narrow one. */
export async function getInventoryStats(): Promise<InventoryStats> {
  const rows = await db.inventoryItem.findMany({
    take: MAX_SCAN_ROWS,
    select: { onHandQty: true, reservedQty: true, lowStockThreshold: true },
  });

  let lowStock = 0;
  let outOfStock = 0;
  for (const row of rows) {
    const available = availableQty(row.onHandQty, row.reservedQty);
    if (available <= 0) outOfStock++;
    else if (isLowStock(row.onHandQty, row.reservedQty, row.lowStockThreshold)) lowStock++;
  }

  return { totalTracked: rows.length, lowStock, outOfStock };
}

export interface InventoryListFilters {
  storeId?: string;
  lowStockOnly?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface InventoryListRow {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productSku: string;
  variantSku: string;
  variantLabel: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  lowStockThreshold: number;
  lowStock: boolean;
}

export interface InventoryListPage {
  items: InventoryListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Tracked items anywhere, ignoring every filter on this call — what
      lets the page tell "nothing has ever been tracked" apart from
      "these filters matched nothing". */
  totalTrackedAnywhere: number;
}

/**
 * The stock list behind `/admin/inventory`.
 *
 * `available` is derived, never stored — see `availableQty` — so "at or
 * below its threshold" is a comparison between two columns, the same
 * shape of comparison that forces the reservation `UPDATE` above to be
 * raw SQL. This phase does not add new raw SQL, so the comparison is done
 * in application code instead: the store and search filters narrow what
 * the database returns, and the low-stock filter and pagination are
 * applied after, in JS. Correct for the size this table is expected to
 * be — inventory is opt-in, see the module comment at the top of this
 * file — with `MAX_SCAN_ROWS` as the backstop if that assumption stops
 * holding.
 */
export async function listInventoryItems(
  filters: InventoryListFilters,
): Promise<InventoryListPage> {
  const { page, pageSize, skip } = resolveInventoryPage(filters.page, filters.pageSize);

  const search = filters.search?.trim();

  const where: Prisma.InventoryItemWhereInput = {
    ...(filters.storeId ? { storeId: filters.storeId } : {}),
    ...(search
      ? {
          variant: {
            OR: [
              { sku: { contains: search, mode: "insensitive" } },
              { product: { name: { contains: search, mode: "insensitive" } } },
              { product: { sku: { contains: search, mode: "insensitive" } } },
            ],
          },
        }
      : {}),
  };

  const [totalTrackedAnywhere, rows] = await Promise.all([
    db.inventoryItem.count(),
    db.inventoryItem.findMany({
      where,
      take: MAX_SCAN_ROWS,
      orderBy: [{ variant: { product: { name: "asc" } } }, { store: { name: "asc" } }],
      select: {
        id: true,
        onHandQty: true,
        reservedQty: true,
        lowStockThreshold: true,
        variant: {
          select: {
            sku: true,
            label: true,
            product: { select: { id: true, name: true, slug: true, sku: true } },
          },
        },
        store: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  const mapped: InventoryListRow[] = rows.map((row) => ({
    id: row.id,
    productId: row.variant.product.id,
    productName: row.variant.product.name,
    productSlug: row.variant.product.slug,
    productSku: row.variant.product.sku,
    variantSku: row.variant.sku,
    variantLabel: row.variant.label,
    storeId: row.store.id,
    storeCode: row.store.code,
    storeName: row.store.name,
    onHandQty: row.onHandQty,
    reservedQty: row.reservedQty,
    availableQty: availableQty(row.onHandQty, row.reservedQty),
    lowStockThreshold: row.lowStockThreshold,
    lowStock: isLowStock(row.onHandQty, row.reservedQty, row.lowStockThreshold),
  }));

  const filtered = filters.lowStockOnly ? mapped.filter((r) => r.lowStock) : mapped;
  const total = filtered.length;
  const items = filtered.slice(skip, skip + pageSize);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    totalTrackedAnywhere,
  };
}

export interface InventoryItemDetail {
  id: string;
  onHandQty: number;
  reservedQty: number;
  lowStockThreshold: number;
  productId: string;
  productName: string;
  productSlug: string;
  productSku: string;
  productStockTracked: boolean;
  variantId: string;
  variantSku: string;
  variantLabel: string;
  storeId: string;
  storeCode: string;
  storeName: string;
}

/** One item's full detail for `/admin/inventory/[itemId]`. `null` if the
    id does not exist — the page's cue to 404 rather than render nothing. */
export async function getInventoryItemDetail(
  itemId: string,
): Promise<InventoryItemDetail | null> {
  const item = await db.inventoryItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      onHandQty: true,
      reservedQty: true,
      lowStockThreshold: true,
      variant: {
        select: {
          id: true,
          sku: true,
          label: true,
          product: {
            select: { id: true, name: true, slug: true, sku: true, stockTracked: true },
          },
        },
      },
      store: { select: { id: true, code: true, name: true } },
    },
  });
  if (!item) return null;

  return {
    id: item.id,
    onHandQty: item.onHandQty,
    reservedQty: item.reservedQty,
    lowStockThreshold: item.lowStockThreshold,
    productId: item.variant.product.id,
    productName: item.variant.product.name,
    productSlug: item.variant.product.slug,
    productSku: item.variant.product.sku,
    productStockTracked: item.variant.product.stockTracked,
    variantId: item.variant.id,
    variantSku: item.variant.sku,
    variantLabel: item.variant.label,
    storeId: item.store.id,
    storeCode: item.store.code,
    storeName: item.store.name,
  };
}

export interface InventoryMovementRow {
  id: string;
  kind: InventoryMovementKind;
  qty: number;
  onHandQty: number;
  reservedQty: number;
  orderId: string | null;
  /** The human-quotable code (`Order.reference`), resolved from the
      stored `orderId` — see the model comment on `InventoryMovement`:
      that column is deliberately not a foreign key. `null` whenever
      `orderId` is `null`, or — an order row cannot be deleted, but
      defensively — whenever it fails to resolve. */
  orderReference: string | null;
  reason: string | null;
  staffUserId: string | null;
  staffUserName: string | null;
  createdAt: Date;
}

export interface InventoryMovementPage {
  items: InventoryMovementRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const DEFAULT_MOVEMENT_PAGE_SIZE = 50;

/** The full, newest-first movement trail for one item — the audit log
    `/admin/inventory/[itemId]` renders plainly and completely. */
export async function listInventoryMovements(
  itemId: string,
  page?: number,
  pageSize?: number,
): Promise<InventoryMovementPage> {
  const resolved = resolveInventoryPage(page, pageSize ?? DEFAULT_MOVEMENT_PAGE_SIZE);

  const [total, rows] = await Promise.all([
    db.inventoryMovement.count({ where: { inventoryItemId: itemId } }),
    db.inventoryMovement.findMany({
      where: { inventoryItemId: itemId },
      orderBy: { createdAt: "desc" },
      skip: resolved.skip,
      take: resolved.pageSize,
      select: {
        id: true,
        kind: true,
        qty: true,
        onHandQty: true,
        reservedQty: true,
        orderId: true,
        reason: true,
        staffUserId: true,
        createdAt: true,
        staffUser: { select: { name: true, phone: true } },
      },
    }),
  ]);

  const orderIds = [...new Set(rows.map((r) => r.orderId).filter((v): v is string => v != null))];
  const orders = orderIds.length
    ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, reference: true } })
    : [];
  const orderRefById = new Map(orders.map((o) => [o.id, o.reference]));

  const items: InventoryMovementRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    qty: r.qty,
    onHandQty: r.onHandQty,
    reservedQty: r.reservedQty,
    orderId: r.orderId,
    orderReference: r.orderId ? (orderRefById.get(r.orderId) ?? null) : null,
    reason: r.reason,
    staffUserId: r.staffUserId,
    staffUserName: r.staffUser?.name ?? r.staffUser?.phone ?? null,
    createdAt: r.createdAt,
  }));

  return {
    items,
    total,
    page: resolved.page,
    pageSize: resolved.pageSize,
    totalPages: Math.max(1, Math.ceil(total / resolved.pageSize)),
  };
}

export interface TrackableVariant {
  id: string;
  sku: string;
  label: string;
  productId: string;
  productName: string;
  productSku: string;
  productSlug: string;
  productStockTracked: boolean;
}

const MAX_TRACK_SEARCH_RESULTS = 20;

function toTrackableVariant(row: {
  id: string;
  sku: string;
  label: string;
  product: { id: string; name: string; sku: string; slug: string; stockTracked: boolean };
}): TrackableVariant {
  return {
    id: row.id,
    sku: row.sku,
    label: row.label,
    productId: row.product.id,
    productName: row.product.name,
    productSku: row.product.sku,
    productSlug: row.product.slug,
    productStockTracked: row.product.stockTracked,
  };
}

/** Candidates for "start tracking a variant" — matched the same way the
    stock list's own search box matches, against variant and product SKU
    and product name. Blank search returns nothing rather than the first
    page of the whole catalogue, which is not a useful "start tracking"
    candidate list. */
export async function searchTrackableVariants(search: string): Promise<TrackableVariant[]> {
  const term = search.trim();
  if (!term) return [];

  const rows = await db.productVariant.findMany({
    where: {
      OR: [
        { sku: { contains: term, mode: "insensitive" } },
        { product: { name: { contains: term, mode: "insensitive" } } },
        { product: { sku: { contains: term, mode: "insensitive" } } },
      ],
    },
    take: MAX_TRACK_SEARCH_RESULTS,
    orderBy: { product: { name: "asc" } },
    select: {
      id: true,
      sku: true,
      label: true,
      product: { select: { id: true, name: true, sku: true, slug: true, stockTracked: true } },
    },
  });

  return rows.map(toTrackableVariant);
}

/** One variant by id, for the second step of "start tracking" once one
    has been picked. `null` if it does not exist. */
export async function getVariantForTracking(variantId: string): Promise<TrackableVariant | null> {
  const row = await db.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      sku: true,
      label: true,
      product: { select: { id: true, name: true, sku: true, slug: true, stockTracked: true } },
    },
  });
  return row ? toTrackableVariant(row) : null;
}
