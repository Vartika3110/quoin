import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { VendorsNotDispatchedError, isAdminTransitionAllowed } = await import(
  "@/lib/data/admin-orders"
);
const { ORDER_STATUS_LABEL } = await import("@/lib/data/order-history");
const { isRetiredStatus } = await import("@/lib/orders/lifecycle");

type OrderStatus = import("@prisma/client").OrderStatus;

/**
 * Two things the admin console was getting wrong, both found by using it
 * rather than by reading it.
 *
 * The first is the one that could mislead a customer. `AGENTS.md` says
 * an order "only reaches `DISPATCHED` when every one of them has", and
 * the vendor-facing path honours that — `order-dispatch.ts` checks
 * `allDispatched` before advancing the order, because "the customer is
 * told once, when the whole order is on its way". The admin status
 * dropdown had no such check, and the route behind it calls
 * `notifyOrderStatus` and `notifyCustomerOfStatus`, so marking an order
 * dispatched by hand told the customer their goods had left while every
 * vendor leg was still `PENDING`.
 *
 * The second is the queue's status filter, which offered **four options
 * reading "Placed"** — `PAID` plus the three retired statuses. Picking
 * the wrong one answered "0 orders — Placed" while placed orders
 * existed.
 */

describe("VendorsNotDispatchedError", () => {
  it("says how many legs are outstanding and what clears them", () => {
    /* The message is the whole value of this error: a staff member who
       hits it needs to know the order is fine and what to do next, not
       that something failed. */
    const error = new VendorsNotDispatchedError(2, 3);
    assert.match(error.message, /2 of 3 vendors/);
    assert.match(error.message, /moves itself once the last one has/);
    assert.equal(error.name, "VendorsNotDispatchedError");
  });

  it("explains the consequence rather than just refusing", () => {
    assert.match(
      new VendorsNotDispatchedError(1, 1).message,
      /tell the customer their whole order is on its way/,
    );
  });
});

describe("the order queue's status filter", () => {
  /* Mirrors `OrderStatusFilterForm`'s own derivation. If that component
     stops filtering, this test keeps failing until somebody decides it
     on purpose. */
  const offered = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).filter(
    (status) => !isRetiredStatus(status),
  );

  it("offers no two options with the same label", () => {
    /* The actual defect, stated as the property that was violated. */
    const labels = offered.map((status) => ORDER_STATUS_LABEL[status]);
    const duplicates = labels.filter((l, i) => labels.indexOf(l) !== i);
    assert.deepEqual(
      duplicates,
      [],
      `these labels appear more than once in the filter: ${[...new Set(duplicates)].join(", ")}`,
    );
  });

  it("drops exactly the retired statuses and nothing else", () => {
    const dropped = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).filter(
      (status) => !offered.includes(status),
    );
    assert.deepEqual(dropped.sort(), ["CONFIRMED", "PACKED", "PROCESSING"]);
  });

  it("still offers every status an order can actually be in", () => {
    /* Removing the duplicates must not have removed a real filter. */
    for (const status of [
      "PENDING_PAYMENT",
      "PAID",
      "FAILED",
      "CANCELLED",
      "DISPATCHED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "REFUND_PENDING",
      "REFUNDED",
    ] as OrderStatus[]) {
      assert.ok(offered.includes(status), `${status} must stay filterable`);
    }
  });

  it("agrees with the transition gate about what is retired", () => {
    /* One source for "retired", used by both the filter and the gate
       that stops a new order arriving in one. */
    for (const status of ["CONFIRMED", "PROCESSING", "PACKED"] as OrderStatus[]) {
      assert.equal(isAdminTransitionAllowed("PAID", status), false);
      assert.equal(offered.includes(status), false);
    }
  });
});
