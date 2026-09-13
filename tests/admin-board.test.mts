import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and admin-board.ts pulls in `db`
   (src/lib/db.ts) and admin-orders.ts, both of which pull in `env`. Same
   shim as tests/unit.test.mts and tests/admin-metrics.test.mts. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { boardColumnForStatus, forwardNextStatus, formatRelativeIst, BOARD_COLUMNS } = await import(
  "@/lib/data/admin-board"
);

type OrderStatus = import("@prisma/client").OrderStatus;

// Hand-copied from `prisma/schema.prisma`'s `OrderStatus` enum, the same
// idiom `tests/admin-orders.test.mts` already uses — a real client import
// here would only make an "exactly once" test importing the exact list it
// is checking against.
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

describe("boardColumnForStatus", () => {
  it("places every OrderStatus in exactly one real column", () => {
    for (const status of ALL_STATUSES) {
      const column = boardColumnForStatus(status);
      assert.ok(
        BOARD_COLUMNS.includes(column),
        `${status} mapped to ${column}, which is not a real board column`,
      );
    }
  });

  it("covers every status — nothing falls through to undefined", () => {
    for (const status of ALL_STATUSES) {
      assert.notEqual(boardColumnForStatus(status), undefined, `${status} has no column`);
    }
  });

  it("matches the column boundaries the spec drew", () => {
    assert.equal(boardColumnForStatus("PENDING_PAYMENT"), "new");
    assert.equal(boardColumnForStatus("PAID"), "new");
    assert.equal(boardColumnForStatus("CONFIRMED"), "confirmed");
    assert.equal(boardColumnForStatus("PROCESSING"), "preparing");
    assert.equal(boardColumnForStatus("PACKED"), "preparing");
    assert.equal(boardColumnForStatus("DISPATCHED"), "on_the_way");
    assert.equal(boardColumnForStatus("OUT_FOR_DELIVERY"), "on_the_way");
    assert.equal(boardColumnForStatus("DELIVERED"), "delivered");
    assert.equal(boardColumnForStatus("CANCELLED"), "cancelled");
    assert.equal(boardColumnForStatus("REFUND_PENDING"), "cancelled");
    assert.equal(boardColumnForStatus("REFUNDED"), "cancelled");
    assert.equal(boardColumnForStatus("FAILED"), "cancelled");
  });
});

describe("forwardNextStatus", () => {
  it("never offers PAID — only the webhook may set it", () => {
    for (const status of ALL_STATUSES) {
      assert.notEqual(forwardNextStatus(status), "PAID", `${status} must not offer PAID`);
    }
  });

  it("returns null for every terminal state in the lifecycle table", () => {
    // CANCELLED and REFUNDED have no outgoing edge at all in
    // `ORDER_TRANSITIONS` (src/lib/data/orders.ts) — nothing can ever be
    // "forward" from them.
    assert.equal(forwardNextStatus("CANCELLED"), null);
    assert.equal(forwardNextStatus("REFUNDED"), null);
  });

  it("returns null for the last happy-path stop and every off-path status", () => {
    // DELIVERED is the end of the happy-path chain the spec defines, even
    // though the lifecycle itself still allows DELIVERED -> REFUND_PENDING.
    assert.equal(forwardNextStatus("DELIVERED"), null);
    // FAILED and REFUND_PENDING are not on the happy-path chain at all.
    assert.equal(forwardNextStatus("FAILED"), null);
    assert.equal(forwardNextStatus("REFUND_PENDING"), null);
  });

  it("walks the happy path in order", () => {
    assert.equal(forwardNextStatus("PAID"), "CONFIRMED");
    assert.equal(forwardNextStatus("CONFIRMED"), "PROCESSING");
    assert.equal(forwardNextStatus("PROCESSING"), "PACKED");
    assert.equal(forwardNextStatus("PACKED"), "DISPATCHED");
    assert.equal(forwardNextStatus("DISPATCHED"), "OUT_FOR_DELIVERY");
    assert.equal(forwardNextStatus("OUT_FOR_DELIVERY"), "DELIVERED");
  });
});

describe("formatRelativeIst", () => {
  const now = new Date("2026-09-13T12:00:00.000Z");

  it("reads as just now for anything under a minute old", () => {
    assert.equal(formatRelativeIst(new Date("2026-09-13T11:59:31.000Z"), now), "just now");
  });

  it("reads in minutes under an hour", () => {
    assert.equal(formatRelativeIst(new Date("2026-09-13T11:48:00.000Z"), now), "12 min ago");
  });

  it("reads in hours under a day", () => {
    assert.equal(formatRelativeIst(new Date("2026-09-13T09:00:00.000Z"), now), "3 hr ago");
  });

  it("reads in whole days beyond that", () => {
    assert.equal(formatRelativeIst(new Date("2026-09-10T12:00:00.000Z"), now), "3 days ago");
  });
});
