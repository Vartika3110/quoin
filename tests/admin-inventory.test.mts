import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and src/lib/db.ts reads it before this
   file's imports resolve. Same two lines as tests/unit.test.mts — see the
   comment there for why order matters (`AUTH_SECRET` must be set before
   anything that snapshots `process.env` via `@/lib/env` is first
   imported). `??=` so running both test files in one process, as
   `npm test`'s glob does, never fights over who sets it first. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  availableQty,
  isLowStock,
  canApplyAdjustment,
  resolveInventoryPage,
  DEFAULT_INVENTORY_PAGE_SIZE,
} = await import("@/lib/data/inventory");

describe("availableQty", () => {
  it("is on-hand minus reserved", () => {
    assert.equal(availableQty(10, 3), 7);
    assert.equal(availableQty(0, 0), 0);
  });

  it("can go negative — a caller's bug to surface, not to hide", () => {
    assert.equal(availableQty(2, 5), -3);
  });
});

describe("isLowStock", () => {
  it("flags exactly at the threshold, not only strictly under it", () => {
    assert.equal(isLowStock(10, 5, 5), true); // available 5, threshold 5 — at the line
  });

  it("does not flag one unit above the threshold", () => {
    assert.equal(isLowStock(10, 4, 5), false); // available 6, threshold 5
  });

  it("does not flag comfortably above threshold", () => {
    assert.equal(isLowStock(100, 10, 5), false); // available 90
  });

  it("flags an out-of-stock item — available 0 is always at or below any threshold", () => {
    assert.equal(isLowStock(5, 5, 0), true);
  });

  it("flags a negative-available item the same way", () => {
    assert.equal(isLowStock(2, 5, 0), true);
  });
});

describe("canApplyAdjustment — the reserved-floor guard", () => {
  it("allows an adjustment that leaves on-hand at or above reserved", () => {
    assert.equal(canApplyAdjustment(10, 3, -5), true); // 10-5=5 >= 3
    assert.equal(canApplyAdjustment(10, 3, -7), true); // 10-7=3 >= 3, exactly at the floor
  });

  it("rejects an adjustment that would take on-hand below reserved", () => {
    assert.equal(canApplyAdjustment(10, 3, -8), false); // 10-8=2 < 3
  });

  it("rejects an adjustment that would take on-hand negative even with nothing reserved", () => {
    assert.equal(canApplyAdjustment(5, 0, -6), false); // -1 < 0
  });

  it("always allows a positive receipt-shaped adjustment", () => {
    assert.equal(canApplyAdjustment(0, 0, 100), true);
  });
});

describe("resolveInventoryPage — filter/pagination bounds", () => {
  it("defaults to page 1 at the default page size", () => {
    const resolved = resolveInventoryPage();
    assert.deepEqual(resolved, {
      page: 1,
      pageSize: DEFAULT_INVENTORY_PAGE_SIZE,
      skip: 0,
    });
  });

  it("computes skip from page and pageSize", () => {
    assert.deepEqual(resolveInventoryPage(3, 10), { page: 3, pageSize: 10, skip: 20 });
  });

  it("clamps page below 1 up to 1", () => {
    assert.equal(resolveInventoryPage(0, 10).page, 1);
    assert.equal(resolveInventoryPage(-5, 10).page, 1);
  });

  it("clamps pageSize below 1 up to 1, not treating 0 as unset", () => {
    assert.equal(resolveInventoryPage(1, 0).pageSize, 1);
  });

  it("clamps an oversized pageSize down to the maximum", () => {
    assert.equal(resolveInventoryPage(1, 10_000).pageSize, 100);
  });

  it("falls back to the default for non-finite input", () => {
    assert.equal(resolveInventoryPage(NaN, Infinity).pageSize, DEFAULT_INVENTORY_PAGE_SIZE);
    assert.equal(resolveInventoryPage(NaN, Infinity).page, 1);
  });

  it("truncates a fractional page or pageSize rather than rounding", () => {
    assert.equal(resolveInventoryPage(2.9, 10).page, 2);
    assert.equal(resolveInventoryPage(1, 10.9).pageSize, 10);
  });
});
