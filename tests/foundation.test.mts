import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { projectMoney } = await import("@/lib/projects/money");
const {
  canTransitionBooking,
  nextBookingStatuses,
  initialBookingStatus,
  bookingTransitionProblem,
  bookingCommitsMoney,
} = await import("@/lib/services/booking-status");
const { moneyMoved, parseOrderTab, ORDER_TAB_STATUSES } = await import("@/lib/orders/status-groups");

describe("projectMoney", () => {
  it("counts only orders whose money moved as spent", () => {
    const money = projectMoney({
      budgetPaise: 800_000_00,
      orders: [
        { status: "PAID", totalPaise: 10_000_00 },
        { status: "DELIVERED", totalPaise: 5_000_00 },
        { status: "PENDING_PAYMENT", totalPaise: 99_000_00 },
        { status: "REFUNDED", totalPaise: 7_000_00 },
        { status: "FAILED", totalPaise: 3_000_00 },
      ],
      materials: [],
      services: [],
    });
    assert.equal(money.spentPaise, 15_000_00);
    assert.equal(money.remainingPaise, 785_000_00);
  });

  it("commits hand-tracked materials and accepted quotes, never planned lines or open quotes", () => {
    const money = projectMoney({
      budgetPaise: 100_000,
      orders: [],
      materials: [
        { status: "ordered", qty: 2.5, unitPricePaise: 1001 }, // 2502.5 → 2503
        { status: "delivered", qty: 1, unitPricePaise: 500 },
        { status: "planned", qty: 3, unitPricePaise: 1000 },
      ],
      services: [
        { status: "CONFIRMED", quotePaise: 20_000 },
        { status: "QUOTE_RECEIVED", quotePaise: 50_000 },
        { status: "CANCELLED", quotePaise: 40_000 },
        { status: "SCHEDULED", quotePaise: null },
      ],
    });
    assert.equal(money.committedPaise, 2503 + 500 + 20_000);
    assert.equal(money.plannedPaise, 3000);
    assert.equal(money.remainingPaise, 100_000 - 23_003);
    assert.ok(Number.isInteger(money.committedPaise));
  });

  it("goes negative when over, and is not over budget without a budget", () => {
    const over = projectMoney({
      budgetPaise: 1000,
      orders: [{ status: "PAID", totalPaise: 1500 }],
      materials: [],
      services: [],
    });
    assert.equal(over.remainingPaise, -500);
    assert.equal(over.overBudget, true);

    const none = projectMoney({
      budgetPaise: 0,
      orders: [{ status: "PAID", totalPaise: 1500 }],
      materials: [],
      services: [],
    });
    assert.equal(none.overBudget, false);
  });
});

describe("booking status machine", () => {
  it("starts quotes and bookings in different places", () => {
    assert.equal(initialBookingStatus("QUOTE"), "QUOTE_PENDING");
    assert.equal(initialBookingStatus("BOOKING"), "REQUESTED");
  });

  it("lets a customer accept a received quote but never price or schedule one", () => {
    assert.equal(canTransitionBooking("QUOTE_RECEIVED", "CONFIRMED", "customer"), true);
    assert.equal(canTransitionBooking("QUOTE_PENDING", "QUOTE_RECEIVED", "customer"), false);
    assert.equal(canTransitionBooking("CONFIRMED", "SCHEDULED", "customer"), false);
    assert.equal(canTransitionBooking("IN_PROGRESS", "CANCELLED", "customer"), false);
    assert.equal(canTransitionBooking("IN_PROGRESS", "CANCELLED", "staff"), true);
  });

  it("has no way out of a terminal status", () => {
    assert.deepEqual(nextBookingStatuses("COMPLETED", "staff"), []);
    assert.deepEqual(nextBookingStatuses("CANCELLED", "staff"), []);
  });

  it("refuses a quote without an amount and a schedule without a time", () => {
    assert.ok(bookingTransitionProblem("QUOTE_RECEIVED", { quotePaise: null, scheduledAt: null }));
    assert.ok(bookingTransitionProblem("QUOTE_RECEIVED", { quotePaise: 0, scheduledAt: null }));
    assert.equal(bookingTransitionProblem("QUOTE_RECEIVED", { quotePaise: 100, scheduledAt: null }), null);
    assert.ok(bookingTransitionProblem("SCHEDULED", { quotePaise: null, scheduledAt: null }));
  });

  it("commits money only once accepted and not cancelled", () => {
    assert.equal(bookingCommitsMoney("QUOTE_RECEIVED"), false);
    assert.equal(bookingCommitsMoney("CONFIRMED"), true);
    assert.equal(bookingCommitsMoney("CANCELLED"), false);
  });
});

describe("order status groups", () => {
  it("treats refund-pending as still spent and refunded as not", () => {
    assert.equal(moneyMoved("REFUND_PENDING"), true);
    assert.equal(moneyMoved("REFUNDED"), false);
    assert.equal(moneyMoved("PENDING_PAYMENT"), false);
  });

  it("puts every status in exactly one tab", () => {
    const all = Object.values(ORDER_TAB_STATUSES).flat();
    assert.equal(new Set(all).size, all.length);
    assert.equal(all.length, 12);
  });

  it("falls back to all for an unknown tab", () => {
    assert.equal(parseOrderTab("shipped"), "shipped");
    assert.equal(parseOrderTab("nonsense"), "all");
    assert.equal(parseOrderTab(undefined), "all");
  });
});
