import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — see tests/unit.test.mts for why these
   two are required even though nothing here touches auth or payments. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  parseOrderStatusFilter,
  isAdminTransitionAllowed,
  legalNextStatuses,
  FULFILMENT_LABEL,
  REFUND_STATUS_LABEL,
} = await import("@/lib/data/admin-orders");

type OrderStatus = import("@prisma/client").OrderStatus;
type Fulfilment = import("@prisma/client").Fulfilment;
type RefundStatus = import("@prisma/client").RefundStatus;

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

describe("admin order filter — status query param", () => {
  it("accepts every real OrderStatus value", () => {
    for (const status of ALL_STATUSES) {
      assert.equal(parseOrderStatusFilter(status), status);
    }
  });

  it("falls back to unfiltered for anything that is not a real status", () => {
    assert.equal(parseOrderStatusFilter(undefined), undefined);
    assert.equal(parseOrderStatusFilter(""), undefined);
    assert.equal(parseOrderStatusFilter("paid"), undefined, "wrong case is not the enum value");
    assert.equal(parseOrderStatusFilter("DELETED"), undefined, "not a status this app has");
    assert.equal(parseOrderStatusFilter("<script>"), undefined, "garbage must not reach Prisma");
  });
});

describe("admin transition boundary — PAID is refused regardless of the machine", () => {
  it("refuses PAID from every reachable starting state, including where canTransition alone would allow it", () => {
    /* PENDING_PAYMENT -> PAID is a legal edge in canTransition's own
       table (see tests/unit.test.mts, "order lifecycle transitions") —
       this is exactly the case the admin boundary exists to override. */
    for (const from of ALL_STATUSES) {
      assert.equal(
        isAdminTransitionAllowed(from, "PAID"),
        false,
        `${from} -> PAID must be refused at the admin boundary`,
      );
    }
  });

  it("never offers PAID as a legal next status from anywhere", () => {
    for (const from of ALL_STATUSES) {
      assert.ok(
        !legalNextStatuses(from).includes("PAID"),
        `legalNextStatuses(${from}) must not include PAID`,
      );
    }
  });
});

describe("admin transition boundary — the retired statuses are refused as destinations", () => {
  it("refuses CONFIRMED, PROCESSING and PACKED from every starting state", () => {
    /* These three are the accept, prepare and ready steps the simplified
       lifecycle does not have. `canTransition` still connects them — so
       an order already sitting in one can be moved forward — and this
       boundary is what stops a *new* order ever arriving there. */
    for (const from of ALL_STATUSES) {
      for (const to of ["CONFIRMED", "PROCESSING", "PACKED"] as const) {
        assert.equal(
          isAdminTransitionAllowed(from, to),
          false,
          `${from} -> ${to} must be refused: ${to} is retired`,
        );
        assert.ok(
          !legalNextStatuses(from).includes(to),
          `legalNextStatuses(${from}) must not include the retired ${to}`,
        );
      }
    }
  });

  it("still moves an order already in a retired status forward to DISPATCHED", () => {
    for (const from of ["CONFIRMED", "PROCESSING", "PACKED"] as const) {
      assert.equal(
        isAdminTransitionAllowed(from, "DISPATCHED"),
        true,
        `an order stuck in ${from} must still be dispatchable`,
      );
    }
  });
});

describe("admin transition boundary — everything else still goes through canTransition", () => {
  it("allows the simplified lifecycle's own moves", () => {
    const legal: [OrderStatus, OrderStatus][] = [
      ["PENDING_PAYMENT", "FAILED"],
      ["PENDING_PAYMENT", "CANCELLED"],
      ["FAILED", "PENDING_PAYMENT"],
      ["FAILED", "CANCELLED"],
      /* placed -> dispatched -> out for delivery -> delivered. */
      ["PAID", "DISPATCHED"],
      ["DISPATCHED", "OUT_FOR_DELIVERY"],
      ["OUT_FOR_DELIVERY", "DELIVERED"],
      /* The exceptional edge, from each status it is reachable from. */
      ["PAID", "CANCELLED"],
      ["DISPATCHED", "CANCELLED"],
      ["OUT_FOR_DELIVERY", "CANCELLED"],
      /* The refund path is untouched by any of this. */
      ["DELIVERED", "REFUND_PENDING"],
      ["REFUND_PENDING", "REFUNDED"],
    ];

    for (const [from, to] of legal) {
      assert.equal(isAdminTransitionAllowed(from, to), true, `${from} -> ${to} should be allowed`);
    }
  });

  it("rejects a move canTransition itself does not allow", () => {
    const illegal: [OrderStatus, OrderStatus][] = [
      ["PENDING_PAYMENT", "DISPATCHED"], // skips PAID
      ["PAID", "DELIVERED"], // skips the vendor and the rider
      ["DELIVERED", "OUT_FOR_DELIVERY"], // backwards
      ["DELIVERED", "PENDING_PAYMENT"],
      ["DELIVERED", "CANCELLED"], // delivered is done; a return is a refund
      ["CANCELLED", "PENDING_PAYMENT"], // terminal
      ["REFUNDED", "PAID"], // terminal, and PAID besides
    ];

    for (const [from, to] of illegal) {
      assert.equal(isAdminTransitionAllowed(from, to), false, `${from} -> ${to} should be rejected`);
    }
  });

  it("rejects everything from both terminal states", () => {
    for (const terminal of ["CANCELLED", "REFUNDED"] as const) {
      for (const to of ALL_STATUSES) {
        assert.equal(isAdminTransitionAllowed(terminal, to), false);
      }
      assert.deepEqual(legalNextStatuses(terminal), []);
    }
  });
});

describe("legalNextStatuses — matches canTransition minus PAID and the retired statuses", () => {
  it("never offers a move that disagrees with isAdminTransitionAllowed", () => {
    for (const from of ALL_STATUSES) {
      const options = legalNextStatuses(from);
      for (const to of ALL_STATUSES) {
        assert.equal(
          options.includes(to),
          isAdminTransitionAllowed(from, to),
          `legalNextStatuses(${from}).includes(${to}) disagreed with isAdminTransitionAllowed`,
        );
      }
    }
  });
});

describe("fulfilment labelling", () => {
  it("labels every Fulfilment value with non-empty, distinct text", () => {
    const values: Fulfilment[] = ["INSTANT", "SCHEDULED", "BOOKABLE", "MADE_TO_ORDER"];
    const labels = values.map((v) => FULFILMENT_LABEL[v]);

    for (const label of labels) {
      assert.ok(label.length > 0);
    }
    assert.equal(new Set(labels).size, labels.length, "labels must be distinct");
  });
});

describe("refund status labelling", () => {
  it("labels every RefundStatus value with non-empty text", () => {
    const values: RefundStatus[] = ["PENDING", "PROCESSED", "FAILED"];
    for (const value of values) {
      assert.ok(REFUND_STATUS_LABEL[value].length > 0);
    }
  });

  it("does not call a failed refund 'Refunded'", () => {
    assert.notEqual(REFUND_STATUS_LABEL.FAILED, REFUND_STATUS_LABEL.PROCESSED);
  });
});
