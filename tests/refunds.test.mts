import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — same setup as the other suites. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { canTransition } = await import("@/lib/data/orders");

const ALL_STATUSES = [
  "PENDING_PAYMENT", "PAID", "FAILED", "CONFIRMED", "PROCESSING", "PACKED",
  "DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED", "REFUND_PENDING",
  "CANCELLED", "REFUNDED",
] as const;

/** Every status reachable from `from`, derived from `canTransition`
    itself rather than from a second copy of the table. */
const onwardFrom = (from: (typeof ALL_STATUSES)[number]) =>
  ALL_STATUSES.filter((to) => canTransition(from, to));

/**
 * The lifecycle, where it touches money.
 *
 * These are regression tests with a specific order behind them.
 * `QO-P8498W` was moved PAID → CANCELLED ninety-four seconds after
 * ₹5,200 had been captured against it by netbanking. No refund was
 * created, no gateway call was made, and the only record that anything
 * happened is a status-change row. The transition was legal, which is
 * the bug: an order whose money has been taken cannot honestly be
 * "cancelled", because cancelling says nothing about the money.
 *
 * What the table must now enforce is that every route out of a paid
 * order either delivers the goods or gives the money back.
 */
describe("an order that has been paid cannot simply be cancelled", () => {
  it("refuses PAID -> CANCELLED", () => {
    assert.equal(canTransition("PAID", "CANCELLED"), false);
  });

  it("refuses it from the fulfilment states too", () => {
    /* The same hole, one and two steps further along. A confirmed or
       picking order has had its money taken just as much as a paid one. */
    assert.equal(canTransition("CONFIRMED", "CANCELLED"), false);
    assert.equal(canTransition("PROCESSING", "CANCELLED"), false);
  });

  it("offers refunding as the way out instead", () => {
    assert.equal(canTransition("PAID", "REFUND_PENDING"), true);
    assert.equal(canTransition("CONFIRMED", "REFUND_PENDING"), true);
    assert.equal(canTransition("PROCESSING", "REFUND_PENDING"), true);
    assert.equal(canTransition("REFUND_PENDING", "REFUNDED"), true);
  });

  it("still lets an unpaid order be cancelled", () => {
    /* The edge that must survive. An abandoned checkout is cleared this
       way, and it is the common case by a wide margin — breaking it to
       fix the paid case would be a worse bug than the one being fixed.
       The captured-payment guard in `transitionOrderStatus` is what
       covers the narrow window where this order's money *has* been taken
       and the webhook has not landed yet. */
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED"), true);
    assert.equal(canTransition("FAILED", "CANCELLED"), true);
  });

  it("keeps the ordinary fulfilment path intact", () => {
    assert.equal(canTransition("PAID", "CONFIRMED"), true);
    assert.equal(canTransition("CONFIRMED", "PROCESSING"), true);
    assert.equal(canTransition("PROCESSING", "PACKED"), true);
    assert.equal(canTransition("PACKED", "DISPATCHED"), true);
    assert.equal(canTransition("DISPATCHED", "OUT_FOR_DELIVERY"), true);
    assert.equal(canTransition("OUT_FOR_DELIVERY", "DELIVERED"), true);
  });

  it("leaves the terminal states terminal", () => {
    /* Money given back, or an order that never happened: nowhere further
       to go, and in particular no route back into fulfilment. */
    assert.deepEqual(onwardFrom("REFUNDED"), []);
    assert.deepEqual(onwardFrom("CANCELLED"), []);
  });

  it("never offers CANCELLED as an onward step once money has moved", () => {
    /* The table drives the admin UI's status buttons, so this is also
       the assertion that staff are not shown the thing they did before. */
    for (const from of ["PAID", "CONFIRMED", "PROCESSING", "PACKED", "DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED"] as const) {
      assert.ok(
        !onwardFrom(from).includes("CANCELLED"),
        `${from} should not offer CANCELLED`,
      );
    }
  });
});

/**
 * Which states a refund may be started from.
 *
 * `refundOrder` used to wrap its status change in
 * `if (canTransition(status, "REFUND_PENDING"))` and carry on
 * regardless — so for any state without that edge it skipped the
 * update, called Razorpay, and returned success. The money went back
 * and the order never said so.
 *
 * That is the same defect as the one this file's first suite covers,
 * one layer along: money moving with nothing recording it. It is worse
 * here, because the four states it affects include CANCELLED, which is
 * exactly where QO-P8498W sits — the order that prompted all of this.
 */
describe("a refund can only start where the order can represent it", () => {
  const REFUNDABLE = ["PAID", "CONFIRMED", "PROCESSING", "PACKED", "DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
  const NOT_REFUNDABLE = ["PENDING_PAYMENT", "FAILED", "CANCELLED", "REFUNDED"] as const;

  it("allows it from every state that has paid for something", () => {
    for (const from of REFUNDABLE) {
      assert.equal(canTransition(from, "REFUND_PENDING"), true, `${from} should be refundable`);
    }
  });

  it("does not allow it from the states that cannot hold a refund", () => {
    /* The assertion that matters is not this one — it is that
       `refundOrder` *refuses* for these rather than refunding anyway.
       See `OrderNotRefundableError`. */
    for (const from of NOT_REFUNDABLE) {
      assert.equal(canTransition(from, "REFUND_PENDING"), false, `${from} should not be refundable`);
    }
  });
});

const { normalizeQty, lineTotal } = await import("@/lib/cart/quantity");

/**
 * The sellable grid, at its edges.
 *
 * `normalizeQty` runs in the browser for the optimistic line total and
 * on the server when the order is priced, so anything it gets wrong is
 * wrong in both places at once and agrees with itself while doing it.
 */
describe("quantity snapping survives a malformed grid", () => {
  it("rounds up onto the step, never down", () => {
    /* Marble in 20 sq.ft. minimums stepping by 5: a request for 23 is
       25, because a customer silently sold 20 is short on site. */
    assert.equal(normalizeQty({ minQty: 20, stepQty: 5 }, 23), 25);
    assert.equal(normalizeQty({ minQty: 20, stepQty: 5 }, 25), 25);
    assert.equal(normalizeQty({ minQty: 1, stepQty: 1 }, 7), 7);
  });

  it("never returns less than the minimum", () => {
    assert.equal(normalizeQty({ minQty: 20, stepQty: 5 }, 1), 20);
    assert.equal(normalizeQty({ minQty: 20, stepQty: 5 }, 0), 20);
    assert.equal(normalizeQty({ minQty: 20, stepQty: 5 }, -5), 20);
  });

  it("does not return NaN when the step is zero", () => {
    /* The regression. A zero step divided into the remainder gives
       Infinity, times zero gives NaN, and a NaN quantity prices a line
       at NaN. Nothing in the database has a zero step today and nothing
       prevents one either. */
    const q = normalizeQty({ minQty: 2, stepQty: 0 }, 7);
    assert.ok(Number.isFinite(q), `expected a finite quantity, got ${q}`);
    assert.equal(q, 7);
    assert.ok(Number.isFinite(lineTotal(41500, q)));
  });

  it("does not return NaN for a negative step either", () => {
    const q = normalizeQty({ minQty: 2, stepQty: -5 }, 7);
    assert.ok(Number.isFinite(q), `expected a finite quantity, got ${q}`);
  });

  it("refuses to be knocked over by a non-finite request", () => {
    assert.equal(normalizeQty({ minQty: 3, stepQty: 1 }, Number.NaN), 3);
    assert.equal(normalizeQty({ minQty: 3, stepQty: 1 }, Number.POSITIVE_INFINITY), 3);
  });
});
