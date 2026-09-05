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
  it("counts only PAID as revenue", () => {
    assert.equal(isRevenueStatus("PAID"), true);
  });

  it("excludes every non-PAID status, including ones that already moved money once", () => {
    const nonRevenue = [
      "PENDING_PAYMENT",
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
    ] as const;
    for (const status of nonRevenue) {
      assert.equal(isRevenueStatus(status), false, `${status} must not count as revenue`);
    }
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
