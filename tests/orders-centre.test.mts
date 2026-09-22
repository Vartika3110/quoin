import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and src/lib/data/payment-history.ts
   pulls in `db` (src/lib/db.ts) via src/lib/data/orders.ts, which pulls in
   `env`. Same shim as tests/projects.test.mts — set before the first
   import that touches it. `src/lib/orders/timeline.ts` itself needs none
   of this (see its own module comment: type-only Prisma import, no `db`),
   but it is imported from the same file as the ones that do. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { orderTimeline } = await import("@/lib/orders/timeline");
const { paymentMethodLabel, paymentStatusLabel, paymentTransactionId } = await import(
  "@/lib/data/payment-history"
);
const { resolveOrderPage } = await import("@/lib/data/order-history");

/** Shorthand for a status-change row in these tests. */
function change(toStatus: string, at: string) {
  return { toStatus: toStatus as never, at };
}

describe("orderTimeline", () => {
  it("a freshly placed, unpaid order: only 'placed' is done, 'payment' is current", () => {
    const result = orderTimeline({
      status: "PENDING_PAYMENT" as never,
      createdAt: "2026-09-01T10:00:00.000Z",
      paidAt: null,
      changes: [],
    });

    assert.equal(result.outcome, null);
    assert.deepEqual(
      result.steps.map((s) => s.state),
      ["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"],
    );
    assert.equal(result.steps[0].key, "placed");
    assert.equal(result.steps[0].at, "2026-09-01T10:00:00.000Z");
    assert.equal(result.steps[1].key, "payment");
    assert.equal(result.steps[1].at, null);
  });

  it("labels match the spec exactly, in order", () => {
    const result = orderTimeline({
      status: "PENDING_PAYMENT" as never,
      createdAt: "2026-09-01T10:00:00.000Z",
      paidAt: null,
      changes: [],
    });
    assert.deepEqual(
      result.steps.map((s) => s.label),
      ["Order placed", "Payment confirmed", "Order confirmed", "Packed", "Out for delivery", "Delivered"],
    );
  });

  it("PAID: placed and payment done (payment.at = paidAt), confirmed current", () => {
    const result = orderTimeline({
      status: "PAID" as never,
      createdAt: "2026-09-01T10:00:00.000Z",
      paidAt: "2026-09-01T10:05:00.000Z",
      changes: [change("PAID", "2026-09-01T10:05:00.000Z")],
    });

    assert.deepEqual(
      result.steps.map((s) => s.state),
      ["done", "done", "current", "upcoming", "upcoming", "upcoming"],
    );
    assert.equal(result.steps[1].at, "2026-09-01T10:05:00.000Z");
  });

  it("CONFIRMED and PROCESSING share the 'confirmed' step and its rank", () => {
    const confirmed = orderTimeline({
      status: "CONFIRMED" as never,
      createdAt: "t0",
      paidAt: "t0",
      changes: [change("PAID", "t0"), change("CONFIRMED", "t1")],
    });
    const processing = orderTimeline({
      status: "PROCESSING" as never,
      createdAt: "t0",
      paidAt: "t0",
      changes: [change("PAID", "t0"), change("CONFIRMED", "t1"), change("PROCESSING", "t2")],
    });

    for (const result of [confirmed, processing]) {
      assert.deepEqual(
        result.steps.map((s) => s.state),
        ["done", "done", "done", "current", "upcoming", "upcoming"],
      );
    }
    /* The 'confirmed' step's timestamp is when the order was first
       confirmed, not when it later moved to PROCESSING. */
    assert.equal(processing.steps[2].at, "t1");
  });

  it("DISPATCHED and OUT_FOR_DELIVERY share the 'out' step, at the earliest of the two", () => {
    const dispatched = orderTimeline({
      status: "DISPATCHED" as never,
      createdAt: "t0",
      paidAt: "t0",
      changes: [
        change("PAID", "t0"),
        change("CONFIRMED", "t1"),
        change("PACKED", "t2"),
        change("DISPATCHED", "t3"),
      ],
    });
    // DISPATCHED and OUT_FOR_DELIVERY share rank 4 with the 'out' step
    // itself, so reaching either one already completes 'out' — the
    // still-open milestone is 'delivered', which is current.
    assert.deepEqual(
      dispatched.steps.map((s) => s.state),
      ["done", "done", "done", "done", "done", "current"],
    );
    assert.equal(dispatched.steps[4].at, "t3");

    const outForDelivery = orderTimeline({
      status: "OUT_FOR_DELIVERY" as never,
      createdAt: "t0",
      paidAt: "t0",
      changes: [
        change("PAID", "t0"),
        change("CONFIRMED", "t1"),
        change("PACKED", "t2"),
        change("DISPATCHED", "t3"),
        change("OUT_FOR_DELIVERY", "t4"),
      ],
    });
    assert.deepEqual(
      outForDelivery.steps.map((s) => s.state),
      ["done", "done", "done", "done", "done", "current"],
    );
    // 'out' step is done as of the earlier DISPATCHED change, not OUT_FOR_DELIVERY.
    assert.equal(outForDelivery.steps[4].at, "t3");
  });

  it("DELIVERED: every step done, nothing current", () => {
    const result = orderTimeline({
      status: "DELIVERED" as never,
      createdAt: "t0",
      paidAt: "t0",
      changes: [
        change("PAID", "t0"),
        change("CONFIRMED", "t1"),
        change("PACKED", "t2"),
        change("DISPATCHED", "t3"),
        change("DELIVERED", "t4"),
      ],
    });
    assert.ok(result.steps.every((s) => s.state === "done"));
    assert.equal(result.outcome, null);
    assert.equal(result.steps.at(-1)!.at, "t4");
  });

  it("never assigns 'current' to more than one step", () => {
    for (const status of ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PACKED", "DISPATCHED"]) {
      const result = orderTimeline({
        status: status as never,
        createdAt: "t0",
        paidAt: "t0",
        changes: [],
      });
      const currentCount = result.steps.filter((s) => s.state === "current").length;
      assert.ok(currentCount <= 1, `${status} produced ${currentCount} current steps`);
    }
  });

  describe("terminal statuses — no 'current' step, 'outcome' carries the label and tone", () => {
    it("CANCELLED straight from PENDING_PAYMENT: only 'placed' done", () => {
      const result = orderTimeline({
        status: "CANCELLED" as never,
        createdAt: "t0",
        paidAt: null,
        changes: [change("CANCELLED", "t1")],
      });
      assert.deepEqual(result.outcome, { label: "Cancelled", tone: "neutral" });
      assert.deepEqual(
        result.steps.map((s) => s.state),
        ["done", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"],
      );
      assert.ok(result.steps.every((s) => s.state !== "current"));
    });

    it("CANCELLED after PAID: 'placed' and 'payment' done, from paidAt alone if no PAID change row exists", () => {
      const result = orderTimeline({
        status: "CANCELLED" as never,
        createdAt: "t0",
        paidAt: "t0-paid",
        changes: [change("CANCELLED", "t1")], // no explicit PAID row
      });
      assert.deepEqual(
        result.steps.map((s) => s.state),
        ["done", "done", "upcoming", "upcoming", "upcoming", "upcoming"],
      );
      assert.equal(result.steps[1].at, "t0-paid");
    });

    it("CANCELLED after CONFIRMED: reached rank comes from the highest-ranked change, ignoring CANCELLED itself", () => {
      const result = orderTimeline({
        status: "CANCELLED" as never,
        createdAt: "t0",
        paidAt: "t0",
        changes: [change("PAID", "t0"), change("CONFIRMED", "t1"), change("CANCELLED", "t2")],
      });
      assert.deepEqual(
        result.steps.map((s) => s.state),
        ["done", "done", "done", "upcoming", "upcoming", "upcoming"],
      );
    });

    it("FAILED with no payment at all: only 'placed' done", () => {
      const result = orderTimeline({
        status: "FAILED" as never,
        createdAt: "t0",
        paidAt: null,
        changes: [],
      });
      assert.deepEqual(result.outcome, { label: "Payment failed", tone: "danger" });
      assert.deepEqual(
        result.steps.map((s) => s.state),
        ["done", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"],
      );
    });

    it("REFUND_PENDING after DELIVERED: every step done", () => {
      const result = orderTimeline({
        status: "REFUND_PENDING" as never,
        createdAt: "t0",
        paidAt: "t0",
        changes: [
          change("PAID", "t0"),
          change("CONFIRMED", "t1"),
          change("PACKED", "t2"),
          change("DISPATCHED", "t3"),
          change("DELIVERED", "t4"),
          change("REFUND_PENDING", "t5"),
        ],
      });
      assert.deepEqual(result.outcome, { label: "Refund pending", tone: "warning" });
      assert.ok(result.steps.every((s) => s.state === "done"));
    });

    it("REFUNDED: label and tone", () => {
      const result = orderTimeline({
        status: "REFUNDED" as never,
        createdAt: "t0",
        paidAt: "t0",
        changes: [change("PAID", "t0"), change("REFUNDED", "t1")],
      });
      assert.deepEqual(result.outcome, { label: "Refunded", tone: "neutral" });
    });
  });

  it("accepts Date objects and ISO strings interchangeably", () => {
    const result = orderTimeline({
      status: "PAID" as never,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      paidAt: new Date("2026-09-01T01:00:00.000Z"),
      changes: [{ toStatus: "PAID" as never, at: new Date("2026-09-01T01:00:00.000Z") }],
    });
    assert.equal(result.steps[0].at, "2026-09-01T00:00:00.000Z");
    assert.equal(result.steps[1].at, "2026-09-01T01:00:00.000Z");
  });
});

describe("payment history display mappers", () => {
  it("paymentStatusLabel collapses CREATED/AUTHORIZED into one reading", () => {
    assert.equal(paymentStatusLabel("CREATED" as never), "Pending");
    assert.equal(paymentStatusLabel("AUTHORIZED" as never), "Pending");
    assert.equal(paymentStatusLabel("CAPTURED" as never), "Paid");
    assert.equal(paymentStatusLabel("FAILED" as never), "Failed");
    assert.equal(paymentStatusLabel("REFUNDED" as never), "Refunded");
  });

  it("paymentMethodLabel maps known Razorpay methods and passes through unknown ones", () => {
    assert.equal(paymentMethodLabel("RAZORPAY" as never, "upi"), "UPI");
    assert.equal(paymentMethodLabel("RAZORPAY" as never, "card"), "Card");
    assert.equal(paymentMethodLabel("RAZORPAY" as never, "netbanking"), "Netbanking");
    assert.equal(paymentMethodLabel("RAZORPAY" as never, "wallet"), "Wallet");
    assert.equal(paymentMethodLabel("RAZORPAY" as never, null), "—");
    // A gateway method this table does not recognise is shown verbatim,
    // not hidden — see the function's own comment.
    assert.equal(paymentMethodLabel("RAZORPAY" as never, "emi"), "emi");
  });

  it("paymentMethodLabel uses OFFLINE_METHOD_LABEL for OFFLINE rows and never a Razorpay label", () => {
    assert.equal(paymentMethodLabel("OFFLINE" as never, "UPI"), "UPI");
    assert.equal(paymentMethodLabel("OFFLINE" as never, "CASH"), "Cash");
    assert.equal(paymentMethodLabel("OFFLINE" as never, "BANK_TRANSFER"), "Bank transfer");
    assert.equal(paymentMethodLabel("OFFLINE" as never, "CHEQUE"), "Cheque");
    assert.equal(paymentMethodLabel("OFFLINE" as never, null), "—");
    assert.equal(paymentMethodLabel("OFFLINE" as never, "upi"), "—"); // wrong case, not a real OFFLINE method
  });

  it("paymentTransactionId prefers a real gateway id, else the honest OFFLINE fallback, else a dash", () => {
    assert.equal(paymentTransactionId("RAZORPAY" as never, "pay_abc123"), "pay_abc123");
    assert.equal(paymentTransactionId("OFFLINE" as never, "pay_abc123"), "pay_abc123");
    assert.equal(paymentTransactionId("OFFLINE" as never, null), "Recorded by Quoin");
    assert.equal(paymentTransactionId("RAZORPAY" as never, null), "—");
  });
});

describe("resolveOrderPage", () => {
  it("defaults to page 1 at the default page size", () => {
    const resolved = resolveOrderPage(undefined, undefined);
    assert.deepEqual(resolved, { page: 1, pageSize: 20, skip: 0 });
  });

  it("clamps a zero or negative page to 1, never to the fallback silently", () => {
    assert.equal(resolveOrderPage(0).page, 1);
    assert.equal(resolveOrderPage(-5).page, 1);
  });

  it("clamps pageSize to the 1..50 range", () => {
    assert.equal(resolveOrderPage(1, 0).pageSize, 1);
    assert.equal(resolveOrderPage(1, 1000).pageSize, 50);
  });

  it("computes skip from a later page", () => {
    assert.equal(resolveOrderPage(3, 20).skip, 40);
  });
});
