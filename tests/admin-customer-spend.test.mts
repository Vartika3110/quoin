import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — see tests/unit.test.mts for why these
   two are required even though nothing here touches auth or payments. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { isRevenueStatus, REVENUE_ORDER_WHERE } = await import(
  "@/lib/data/admin-metrics"
);

type OrderStatus = import("@prisma/client").OrderStatus;

/**
 * What counts as money this customer has spent.
 *
 * Found by walking `/admin/customers` against a seeded order rather than
 * by reading the code: a customer with three captured orders worth
 * ₹6,696 showed **Total spent ₹0**, on both the list and the detail
 * page. Both filtered on a bare `status: "PAID"`.
 *
 * The reason that is wrong is the reason it is worth a test. `PAID` is
 * not where a paid order stays — it is the brief window between the
 * capture settling and the first dispatch. So the figure did not merely
 * under-count: it went to zero the moment the goods left, and a customer
 * whose orders had all been delivered read as having spent nothing. The
 * screens were least accurate about exactly the customers they exist to
 * show.
 *
 * `admin-metrics` had already found this bug once, in the dashboard, and
 * says so in its own comment — "why a bare `status: \"PAID\"` here was
 * the bug". The rule it settled on is `isRevenueStatus`, and
 * `REVENUE_ORDER_WHERE` is that same rule as a Prisma filter so the two
 * cannot drift apart. These tests pin them to each other.
 */

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

/** What `REVENUE_ORDER_WHERE` would admit, evaluated in JS. */
function admittedByFilter(status: OrderStatus, paidAt: Date | null): boolean {
  const notNullOk = REVENUE_ORDER_WHERE.paidAt.not === null ? paidAt !== null : true;
  return notNullOk && status !== REVENUE_ORDER_WHERE.status.not;
}

describe("REVENUE_ORDER_WHERE", () => {
  it("agrees with isRevenueStatus on every status, paid and unpaid", () => {
    /* The two must never diverge: one is used against fetched rows, the
       other is pushed into Postgres, and a customer's lifetime total is
       computed with the second while the first is what the rule means. */
    const paidAt = new Date("2026-11-20T10:00:00Z");
    for (const status of ALL_STATUSES) {
      assert.equal(
        admittedByFilter(status, paidAt),
        isRevenueStatus(status, paidAt),
        `${status} (paid) should be judged the same by both`,
      );
      assert.equal(
        admittedByFilter(status, null),
        isRevenueStatus(status, null),
        `${status} (never paid) should be judged the same by both`,
      );
    }
  });

  it("counts a paid order at every stage after PAID", () => {
    /* This is the regression. Each of these is an order the customer has
       paid for; each was previously counted as ₹0 because its status had
       moved on. */
    const paidAt = new Date();
    for (const status of [
      "PAID",
      "DISPATCHED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "REFUND_PENDING",
    ] as OrderStatus[]) {
      assert.equal(
        isRevenueStatus(status, paidAt),
        true,
        `${status} is money the customer has handed over`,
      );
    }
  });

  it("counts REFUND_PENDING but not REFUNDED", () => {
    /* The distinction the refund lifecycle turns on: a refund that has
       been agreed and not yet sent still means the business holds the
       money. Only `REFUNDED` means it has gone back. */
    const paidAt = new Date();
    assert.equal(isRevenueStatus("REFUND_PENDING", paidAt), true);
    assert.equal(isRevenueStatus("REFUNDED", paidAt), false);
  });

  it("counts nothing that was never paid for", () => {
    /* `paidAt` rather than status is what decides this half: an order
       sitting in PENDING_PAYMENT or one the gateway refused never was
       money, whatever its status column says. */
    for (const status of ALL_STATUSES) {
      assert.equal(
        isRevenueStatus(status, null),
        false,
        `${status} with no paidAt was never money`,
      );
    }
  });

  it("excludes exactly one status, and it is REFUNDED", () => {
    /* Guards against the filter being broadened or narrowed by someone
       reaching for a quick fix: the rule is "everything paid except
       refunded", not a list of allowed statuses that a new stage would
       silently fall outside of. */
    const paidAt = new Date();
    const excluded = ALL_STATUSES.filter((s) => !isRevenueStatus(s, paidAt));
    assert.deepEqual(excluded, ["REFUNDED"]);
  });

  it("is expressed as a filter Prisma can push into Postgres", () => {
    /* Not a predicate the page applies in JS after fetching: the
       customers list sums with a `groupBy` over a page of ids, and
       pulling every order row back to reduce in the application is what
       that query exists to avoid. */
    assert.deepEqual(REVENUE_ORDER_WHERE, {
      paidAt: { not: null },
      status: { not: "REFUNDED" },
    });
  });
});
