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
