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

describe("orderTimeline — the four-step customer stepper", () => {
  it("an unpaid order has nothing done: 'placed' itself is the step in progress", () => {
    /* An order is not *placed* until its money is confirmed, so a
       checkout still at the gateway has reached no step. The old
       six-step stepper marked 'placed' done at `createdAt` and made a
       separate 'payment' step current; collapsing the two is why
       `placed` now reads its timestamp from `paidAt`. */
    const result = orderTimeline({
      status: "PENDING_PAYMENT" as never,
      createdAt: "2026-09-01T10:00:00.000Z",
      paidAt: null,
      changes: [],
    });

    assert.deepEqual(result.steps.map((s) => s.state), [
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    assert.equal(result.steps[0].key, "placed");
    assert.equal(result.steps[0].at, null, "nothing has been paid, so nothing is dated");
    assert.equal(result.outcome, null);
  });

  it("is exactly four steps, named for the four lifecycle stages", () => {
    const result = orderTimeline({
      status: "PAID" as never,
      createdAt: "2026-09-01T10:00:00.000Z",
      paidAt: "2026-09-01T10:05:00.000Z",
      changes: [],
    });

    assert.deepEqual(result.steps.map((s) => s.key), [
      "placed",
      "dispatched",
      "out_for_delivery",
      "delivered",
    ]);
    assert.deepEqual(result.steps.map((s) => s.label), [
      "Order placed",
      "Dispatched",
      "Out for delivery",
      "Delivered",
    ]);
  });

  it("has no step for an accept, prepare or ready stage", () => {
    /* The whole point of the simplified lifecycle. A customer must never
       be shown an internal vendor state. */
    const result = orderTimeline({
      status: "PAID" as never,
      createdAt: "t0",
      paidAt: "t1",
      changes: [],
    });
    const labels = result.steps.map((s) => s.label.toLowerCase()).join(" ");
    for (const banned of ["accept", "prepar", "ready", "packed", "confirm"]) {
      assert.ok(!labels.includes(banned), `the stepper must not mention "${banned}"`);
    }
  });

  it("PAID: 'placed' is done and dated from paidAt, 'dispatched' is current", () => {
    const result = orderTimeline({
      status: "PAID" as never,
      createdAt: "2026-09-01T10:00:00.000Z",
      paidAt: "2026-09-01T10:05:00.000Z",
      changes: [change("PAID", "2026-09-01T10:05:30.000Z")],
    });

    assert.deepEqual(result.steps.map((s) => s.state), [
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
    assert.equal(
      result.steps[0].at,
      "2026-09-01T10:05:00.000Z",
      "paidAt wins over the PAID change row",
    );
  });

  it("the three retired statuses all read as 'placed', awaiting dispatch", () => {
    /* An order left in CONFIRMED, PROCESSING or PACKED when the
       simplified lifecycle shipped must still render, and what it means
       to a customer is the same in all three cases: placed, not yet on
       its way. */
    for (const status of ["CONFIRMED", "PROCESSING", "PACKED"] as const) {
      const result = orderTimeline({
        status: status as never,
        createdAt: "t0",
        paidAt: "t1",
        changes: [change("PAID", "t1"), change(status, "t2")],
      });
      assert.deepEqual(
        result.steps.map((s) => s.state),
        ["done", "current", "upcoming", "upcoming"],
        `${status} should read as placed, awaiting dispatch`,
      );
    }
  });

  it("DISPATCHED and OUT_FOR_DELIVERY are now separate steps, each with its own time", () => {
    /* They shared one step in the six-step version. They do not any
       more: "dispatched" and "out for delivery" are two of the four
       milestones the customer is messaged about, so showing them as one
       would contradict the WhatsApp they just received. */
    const dispatched = orderTimeline({
      status: "DISPATCHED" as never,
      createdAt: "t0",
      paidAt: "t1",
      changes: [change("PAID", "t1"), change("DISPATCHED", "t2")],
    });
    assert.deepEqual(dispatched.steps.map((s) => s.state), [
      "done",
      "done",
      "current",
      "upcoming",
    ]);
    assert.equal(dispatched.steps[1].at, "t2");
    assert.equal(dispatched.steps[2].at, null);

    const out = orderTimeline({
      status: "OUT_FOR_DELIVERY" as never,
      createdAt: "t0",
      paidAt: "t1",
      changes: [change("PAID", "t1"), change("DISPATCHED", "t2"), change("OUT_FOR_DELIVERY", "t3")],
    });
    assert.deepEqual(out.steps.map((s) => s.state), ["done", "done", "done", "current"]);
    assert.equal(out.steps[1].at, "t2");
    assert.equal(out.steps[2].at, "t3");
  });

  it("DELIVERED: every step done, the last dated from its own change row", () => {
    const result = orderTimeline({
      status: "DELIVERED" as never,
      createdAt: "t0",
      paidAt: "t1",
      changes: [
        change("PAID", "t1"),
        change("DISPATCHED", "t2"),
        change("OUT_FOR_DELIVERY", "t3"),
        change("DELIVERED", "t4"),
      ],
    });

    assert.ok(result.steps.every((s) => s.state === "done"));
    assert.equal(result.steps.at(-1)!.at, "t4");
    assert.equal(result.outcome, null);
  });

  it("never produces more than one current step, for any status", () => {
    const statuses = [
      "PENDING_PAYMENT",
      "PAID",
      "FAILED",
      "CANCELLED",
      "CONFIRMED",
      "PROCESSING",
      "PACKED",
      "DISPATCHED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "REFUND_PENDING",
      "REFUNDED",
    ];

    for (const status of statuses) {
      const result = orderTimeline({
        status: status as never,
        createdAt: "t0",
        paidAt: null,
        changes: [],
      });
      const currentCount = result.steps.filter((s) => s.state === "current").length;
      assert.ok(currentCount <= 1, `${status} produced ${currentCount} current steps`);
    }
  });

  describe("an order that left the line", () => {
    it("CANCELLED straight from PENDING_PAYMENT: nothing done at all", () => {
      /* No money was ever captured, so the order was never placed.
         Marking 'placed' done would tell a customer their order exists. */
      const result = orderTimeline({
        status: "CANCELLED" as never,
        createdAt: "t0",
        paidAt: null,
        changes: [change("CANCELLED", "t1")],
      });

      assert.deepEqual(result.steps.map((s) => s.state), [
        "upcoming",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);
      assert.deepEqual(result.outcome, { label: "Cancelled", tone: "neutral" });
      assert.ok(result.steps.every((s) => s.state !== "current"));
    });

    it("CANCELLED after PAID: 'placed' done from paidAt alone, with no PAID change row", () => {
      const result = orderTimeline({
        status: "CANCELLED" as never,
        createdAt: "t0",
        paidAt: "t0-paid",
        changes: [change("CANCELLED", "t2")],
      });

      assert.deepEqual(result.steps.map((s) => s.state), [
        "done",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);
      assert.equal(result.steps[0].at, "t0-paid");
    });

    it("CANCELLED after DISPATCHED: reached rank comes from the highest-ranked change", () => {
      /* A parcel called off after it left the store got further than one
         cancelled on the shelf, and the stepper has to say so. CANCELLED
         itself has no rank — it is an outcome, not a stage. */
      const result = orderTimeline({
        status: "CANCELLED" as never,
        createdAt: "t0",
        paidAt: "t1",
        changes: [change("PAID", "t1"), change("DISPATCHED", "t2"), change("CANCELLED", "t3")],
      });

      assert.deepEqual(result.steps.map((s) => s.state), [
        "done",
        "done",
        "upcoming",
        "upcoming",
      ]);
      assert.deepEqual(result.outcome, { label: "Cancelled", tone: "neutral" });
    });

    it("FAILED with no payment at all: nothing done", () => {
      const result = orderTimeline({
        status: "FAILED" as never,
        createdAt: "t0",
        paidAt: null,
        changes: [change("FAILED", "t1")],
      });

      assert.deepEqual(result.steps.map((s) => s.state), [
        "upcoming",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);
      assert.deepEqual(result.outcome, { label: "Payment failed", tone: "danger" });
    });

    it("REFUNDED after a delivery: every step still done — the delivery happened", () => {
      /* Money coming back does not un-deliver a parcel, which is why
         REFUND_PENDING and REFUNDED are outcomes rather than being folded
         into 'cancelled'. */
      const result = orderTimeline({
        status: "REFUNDED" as never,
        createdAt: "t0",
        paidAt: "t1",
        changes: [
          change("PAID", "t1"),
          change("DISPATCHED", "t2"),
          change("OUT_FOR_DELIVERY", "t3"),
          change("DELIVERED", "t4"),
          change("REFUND_PENDING", "t5"),
          change("REFUNDED", "t6"),
        ],
      });

      assert.ok(result.steps.every((s) => s.state === "done"));
      assert.deepEqual(result.outcome, { label: "Refunded", tone: "neutral" });
    });
  });

  it("accepts Date objects and ISO strings interchangeably", () => {
    const result = orderTimeline({
      status: "DISPATCHED" as never,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      paidAt: new Date("2026-09-01T01:00:00.000Z"),
      changes: [{ toStatus: "DISPATCHED" as never, at: new Date("2026-09-01T02:00:00.000Z") }],
    });

    assert.equal(result.steps[0].at, "2026-09-01T01:00:00.000Z");
    assert.equal(result.steps[1].at, "2026-09-01T02:00:00.000Z");
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
