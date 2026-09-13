import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and admin-metrics.ts pulls in `db`
   (src/lib/db.ts), which pulls in `env`. Same shim as tests/unit.test.mts —
   set before the first import that touches it, or the module snapshots an
   empty DATABASE_URL and every later test in this process sees it too. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  resolveIstDayRangeUtc,
  resolveIstMonthRangeUtc,
  parseMonthParam,
  isRevenueStatus,
  AWAITING_ACTION_STATUSES,
  resolveAdminPage,
} = await import("@/lib/data/admin-metrics");

describe("resolveIstDayRangeUtc", () => {
  it("rolls over at 18:30 UTC (midnight IST), not at UTC midnight", () => {
    // One second before the rollover: still 4 Sep in IST (23:59:59).
    const justBefore = resolveIstDayRangeUtc(new Date("2026-09-04T18:29:59.000Z"));
    // Exactly at the rollover: now 5 Sep in IST (00:00:00).
    const justAfter = resolveIstDayRangeUtc(new Date("2026-09-04T18:30:00.000Z"));

    assert.notEqual(justBefore.start.toISOString(), justAfter.start.toISOString());
    assert.equal(justBefore.end.toISOString(), justAfter.start.toISOString());
  });

  it("returns a whole 24-hour window starting at 18:30 UTC the previous day", () => {
    const { start, end } = resolveIstDayRangeUtc(new Date("2026-09-05T09:00:00.000Z"));
    assert.equal(start.toISOString(), "2026-09-04T18:30:00.000Z");
    assert.equal(end.toISOString(), "2026-09-05T18:30:00.000Z");
    assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
  });

  it("a UTC-midnight instant is still yesterday's IST day", () => {
    // 00:00 UTC is 5:30am IST — well inside the *same* IST day that began
    // at the previous 18:30 UTC. A dashboard reading UTC midnight as the
    // boundary would already be showing the wrong day's figures here.
    const { start } = resolveIstDayRangeUtc(new Date("2026-09-05T00:00:00.000Z"));
    assert.equal(start.toISOString(), "2026-09-04T18:30:00.000Z");
  });
});

describe("isRevenueStatus", () => {
  const PAID_AT = new Date("2026-09-05T10:00:00.000Z");

  it("counts a paid order that has moved on in fulfilment — the bug this rule fixes", () => {
    assert.equal(isRevenueStatus("CONFIRMED", PAID_AT), true);
    assert.equal(isRevenueStatus("DELIVERED", PAID_AT), true);
  });

  it("still counts a refund that has been promised but not yet sent to the gateway", () => {
    assert.equal(isRevenueStatus("REFUND_PENDING", PAID_AT), true);
  });

  it("excludes a refunded order even though it was paid", () => {
    assert.equal(isRevenueStatus("REFUNDED", PAID_AT), false);
  });

  it("excludes anything with no paidAt at all, regardless of status", () => {
    assert.equal(isRevenueStatus("PAID", null), false);
    assert.equal(isRevenueStatus("CONFIRMED", null), false);
  });
});

describe("resolveIstMonthRangeUtc", () => {
  it("September 2026 starts and ends at IST midnight, in UTC", () => {
    const { start, end } = resolveIstMonthRangeUtc(2026, 9);
    assert.equal(start.toISOString(), "2026-08-31T18:30:00.000Z");
    assert.equal(end.toISOString(), "2026-09-30T18:30:00.000Z");
  });

  it("rolls December into January of the next year", () => {
    const { end } = resolveIstMonthRangeUtc(2026, 12);
    assert.equal(end.toISOString(), "2026-12-31T18:30:00.000Z");
    const january = resolveIstMonthRangeUtc(2027, 1);
    assert.equal(january.start.toISOString(), end.toISOString());
  });
});

describe("parseMonthParam", () => {
  const now = new Date("2026-09-13T10:00:00.000Z"); // 13 Sep 2026, IST

  it("accepts a valid past month", () => {
    assert.deepEqual(parseMonthParam("2026-06", now), { year: 2026, month: 6 });
  });

  it("falls back to the current IST month when absent", () => {
    assert.deepEqual(parseMonthParam(undefined, now), { year: 2026, month: 9 });
  });

  it("falls back to the current IST month for a malformed value", () => {
    assert.deepEqual(parseMonthParam("not-a-month", now), { year: 2026, month: 9 });
    assert.deepEqual(parseMonthParam("2026-9", now), { year: 2026, month: 9 });
    assert.deepEqual(parseMonthParam("", now), { year: 2026, month: 9 });
  });

  it("falls back to the current IST month for month 13", () => {
    assert.deepEqual(parseMonthParam("2026-13", now), { year: 2026, month: 9 });
  });

  it("clamps a future month back to the current IST month", () => {
    assert.deepEqual(parseMonthParam("2026-10", now), { year: 2026, month: 9 });
    assert.deepEqual(parseMonthParam("2027-01", now), { year: 2026, month: 9 });
  });

  it("accepts the current month itself", () => {
    assert.deepEqual(parseMonthParam("2026-09", now), { year: 2026, month: 9 });
  });
});

describe("AWAITING_ACTION_STATUSES", () => {
  it("excludes the customer's turn, the courier's turn, and every terminal state", () => {
    for (const excluded of [
      "PENDING_PAYMENT",
      "FAILED",
      "CANCELLED",
      "DISPATCHED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "REFUNDED",
    ] as const) {
      assert.equal(AWAITING_ACTION_STATUSES.includes(excluded), false);
    }
  });

  it("includes exactly the statuses a staff member still has to move forward", () => {
    assert.deepEqual(
      [...AWAITING_ACTION_STATUSES].sort(),
      ["CONFIRMED", "PACKED", "PAID", "PROCESSING", "REFUND_PENDING"].sort(),
    );
  });
});

describe("resolveAdminPage", () => {
  it("defaults to page 1 at the default page size", () => {
    const resolved = resolveAdminPage();
    assert.equal(resolved.page, 1);
    assert.equal(resolved.pageSize, 20);
    assert.equal(resolved.skip, 0);
  });

  it("computes skip from page and pageSize", () => {
    const resolved = resolveAdminPage(3, 10);
    assert.equal(resolved.page, 3);
    assert.equal(resolved.pageSize, 10);
    assert.equal(resolved.skip, 20);
  });

  it("clamps page below 1 up to 1", () => {
    assert.equal(resolveAdminPage(0).page, 1);
    assert.equal(resolveAdminPage(-5).page, 1);
  });

  it("clamps page size above the max down to the max", () => {
    assert.equal(resolveAdminPage(1, 500).pageSize, 50);
  });

  it("clamps a genuinely-zero page size up to 1 rather than treating it as unset", () => {
    // The bug this guards: `pageSize || DEFAULT` would silently widen an
    // explicit 0 back to 20, which is a different, larger page than the
    // caller asked for.
    assert.equal(resolveAdminPage(1, 0).pageSize, 1);
  });

  it("falls back to defaults for non-finite input", () => {
    assert.equal(resolveAdminPage(NaN, Infinity).page, 1);
    assert.equal(resolveAdminPage(NaN, Infinity).pageSize, 20);
  });
});
