import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — see tests/unit.test.mts for why these
   two are required even though nothing here touches auth or payments. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { validateOfflinePayment, InvalidOfflinePaymentError, canTransition } = await import(
  "@/lib/data/orders"
);
const { isAdminTransitionAllowed } = await import("@/lib/data/admin-orders");
const { formatPrice } = await import("@/lib/types/catalog");

type OrderStatus = import("@prisma/client").OrderStatus;

const ALL_STATUSES: OrderStatus[] = [
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

const TOTAL_PAISE = 15_00_00; // ₹1,50,000 — order total the claim is checked against

describe("validateOfflinePayment — method", () => {
  it("accepts every method staff can record", () => {
    for (const method of ["UPI", "CASH", "BANK_TRANSFER", "CHEQUE"] as const) {
      const claim = validateOfflinePayment({ method, amountPaise: TOTAL_PAISE }, TOTAL_PAISE);
      assert.equal(claim.method, method);
    }
  });

  it("rejects a method that is not one of the four", () => {
    for (const method of ["NETBANKING", "upi", "", "WALLET", "Cash"]) {
      assert.throws(
        () => validateOfflinePayment({ method, amountPaise: TOTAL_PAISE }, TOTAL_PAISE),
        InvalidOfflinePaymentError,
        `"${method}" should have been rejected`,
      );
    }
  });
});

describe("validateOfflinePayment — amount", () => {
  it("rejects a non-integer amount", () => {
    assert.throws(
      () => validateOfflinePayment({ method: "UPI", amountPaise: TOTAL_PAISE + 0.5 }, TOTAL_PAISE),
      InvalidOfflinePaymentError,
    );
  });

  it("rejects zero", () => {
    assert.throws(
      () => validateOfflinePayment({ method: "UPI", amountPaise: 0 }, TOTAL_PAISE),
      InvalidOfflinePaymentError,
    );
  });

  it("rejects a negative amount", () => {
    assert.throws(
      () => validateOfflinePayment({ method: "UPI", amountPaise: -TOTAL_PAISE }, TOTAL_PAISE),
      InvalidOfflinePaymentError,
    );
  });

  it("accepts an amount that exactly equals the order total", () => {
    const claim = validateOfflinePayment({ method: "CASH", amountPaise: TOTAL_PAISE }, TOTAL_PAISE);
    assert.equal(claim.amountPaise, TOTAL_PAISE);
  });

  it("rejects an amount that does not equal the order total, with the ₹ message", () => {
    assert.throws(
      () => validateOfflinePayment({ method: "CASH", amountPaise: TOTAL_PAISE - 1 }, TOTAL_PAISE),
      (error: unknown) =>
        error instanceof InvalidOfflinePaymentError &&
        error.message ===
          `Amount must equal the order total of ${formatPrice(TOTAL_PAISE)}. Part payments can't be recorded yet.`,
    );
  });

  it("rejects an amount greater than the order total the same way as one below it", () => {
    assert.throws(
      () => validateOfflinePayment({ method: "CASH", amountPaise: TOTAL_PAISE + 1 }, TOTAL_PAISE),
      InvalidOfflinePaymentError,
    );
  });
});

describe("validateOfflinePayment — reference", () => {
  it("trims whitespace", () => {
    const claim = validateOfflinePayment(
      { method: "UPI", amountPaise: TOTAL_PAISE, offlineReference: "  ABC123  " },
      TOTAL_PAISE,
    );
    assert.equal(claim.offlineReference, "ABC123");
  });

  it("caps at 100 characters", () => {
    const claim = validateOfflinePayment(
      { method: "UPI", amountPaise: TOTAL_PAISE, offlineReference: "x".repeat(150) },
      TOTAL_PAISE,
    );
    assert.equal(claim.offlineReference?.length, 100);
  });

  it("is null when absent or blank", () => {
    assert.equal(
      validateOfflinePayment({ method: "UPI", amountPaise: TOTAL_PAISE }, TOTAL_PAISE).offlineReference,
      null,
    );
    assert.equal(
      validateOfflinePayment(
        { method: "UPI", amountPaise: TOTAL_PAISE, offlineReference: "   " },
        TOTAL_PAISE,
      ).offlineReference,
      null,
    );
  });
});

describe("validateOfflinePayment — note", () => {
  it("trims whitespace and caps at 500 characters", () => {
    const claim = validateOfflinePayment(
      { method: "UPI", amountPaise: TOTAL_PAISE, note: "  " + "y".repeat(600) + "  " },
      TOTAL_PAISE,
    );
    assert.equal(claim.note?.length, 500);
    assert.ok(claim.note?.startsWith("y"));
  });

  it("is null when absent or blank", () => {
    assert.equal(
      validateOfflinePayment({ method: "UPI", amountPaise: TOTAL_PAISE }, TOTAL_PAISE).note,
      null,
    );
  });
});

describe("offline settlement — the two edges recordOfflinePayment relies on", () => {
  it("PENDING_PAYMENT -> PAID and PAID -> CONFIRMED are both legal in the lifecycle table", () => {
    assert.equal(canTransition("PENDING_PAYMENT", "PAID"), true);
    assert.equal(canTransition("PAID", "CONFIRMED"), true);
  });
});

describe("admin boundary — still refuses PAID for every status, offline payments included", () => {
  it("isAdminTransitionAllowed(x, PAID) is false for every reachable x", () => {
    /* recordOfflinePayment writes PAID itself, from inside
       src/lib/data/orders.ts — it does not go through this boundary or
       through transitionOrderStatus at all. This is the guarantee that
       adding it did not loosen: the *generic* admin status route still
       has no way to set PAID by hand, for any starting state. */
    for (const from of ALL_STATUSES) {
      assert.equal(isAdminTransitionAllowed(from, "PAID"), false, `${from} -> PAID must be refused`);
    }
  });
});
