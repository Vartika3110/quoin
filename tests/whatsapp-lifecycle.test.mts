import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and the data modules below pull in
   `db` (src/lib/db.ts) via src/lib/env.ts. Same shim every other test
   that reaches a data module uses. `src/lib/orders/lifecycle.ts` and
   `src/lib/whatsapp/templates.ts` need none of it — both are type-only
   Prisma imports with no `db` — but they are asserted against alongside
   the ones that do. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  ORDER_STAGE_LABEL,
  ORDER_STAGE_SEQUENCE,
  RETIRED_FULFILMENT_STATUSES,
  STATUS_FOR_STAGE,
  isRetiredStatus,
  stageForStatus,
} = await import("@/lib/orders/lifecycle");

const { TEMPLATE_NAME, MESSAGE_TYPE_LABEL, bodyParameters, buttonUrlSuffix, renderBody } =
  await import("@/lib/whatsapp/templates");

const { summariseWhatsApp } = await import("@/lib/data/whatsapp-notifications");
const { customerEventKey, vendorEventKey, messageTypeForStatus } = await import(
  "@/lib/data/order-whatsapp"
);
const { getFulfilmentByToken } = await import("@/lib/data/order-fulfilments");

type OrderStatus = import("@prisma/client").OrderStatus;
type WhatsAppMessageType = import("@prisma/client").WhatsAppMessageType;

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

const ALL_MESSAGE_TYPES: WhatsAppMessageType[] = [
  "ORDER_PLACED",
  "NEW_VENDOR_ORDER",
  "ORDER_DISPATCHED",
  "OUT_FOR_DELIVERY",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
];

/** ------------------------------------------------------------------ */

describe("order lifecycle stages", () => {
  it("is exactly four stages on the happy path, in order", () => {
    assert.deepEqual(ORDER_STAGE_SEQUENCE, [
      "placed",
      "dispatched",
      "out_for_delivery",
      "delivered",
    ]);
  });

  it("has no accepted, preparing or ready stage", () => {
    const stages = [...ORDER_STAGE_SEQUENCE, "cancelled"];
    for (const banned of ["accepted", "preparing", "ready"]) {
      assert.ok(!stages.includes(banned as never), `"${banned}" must not be a stage`);
    }
  });

  it("does not put cancelled on the happy path — it is leaving the line, not a further step", () => {
    assert.ok(!(ORDER_STAGE_SEQUENCE as readonly string[]).includes("cancelled"));
    assert.equal(ORDER_STAGE_LABEL.cancelled, "Cancelled");
  });

  it("maps PAID to 'placed' — the order is placed when the money is confirmed", () => {
    assert.equal(stageForStatus("PAID"), "placed");
  });

  it("gives a paid-but-not-yet-dispatched order no stage before its money lands", () => {
    /* An abandoned checkout sits in PENDING_PAYMENT forever, and a failed
       attempt can still be paid. Neither has reached the line. */
    assert.equal(stageForStatus("PENDING_PAYMENT"), null);
    assert.equal(stageForStatus("FAILED"), null);
  });

  it("keeps the refund statuses off the lifecycle rather than folding them into cancelled", () => {
    /* A delivered order can be refunded without the delivery
       un-happening, so these describe money and not a parcel. */
    assert.equal(stageForStatus("REFUND_PENDING"), null);
    assert.equal(stageForStatus("REFUNDED"), null);
  });

  it("maps every retired status to 'placed', so old orders still render", () => {
    for (const status of RETIRED_FULFILMENT_STATUSES) {
      assert.equal(stageForStatus(status), "placed", `${status} should read as placed`);
      assert.ok(isRetiredStatus(status));
    }
  });

  it("retires exactly the three statuses that were accept, prepare and ready", () => {
    assert.deepEqual([...RETIRED_FULFILMENT_STATUSES], ["CONFIRMED", "PROCESSING", "PACKED"]);
    for (const status of ALL_STATUSES) {
      const retired = (RETIRED_FULFILMENT_STATUSES as readonly string[]).includes(status);
      assert.equal(isRetiredStatus(status), retired, `isRetiredStatus(${status}) disagreed`);
    }
  });

  it("gives every status an explicit answer — nothing falls through to undefined", () => {
    for (const status of ALL_STATUSES) {
      assert.notEqual(
        stageForStatus(status),
        undefined,
        `${status} has no entry in the stage map`,
      );
    }
  });

  it("never exposes PAID as a writable stage target", () => {
    /* `PAID` is reachable only through a verified capture or the staff
       offline-payment action, so the stage→status table must not hand it
       to a caller. */
    assert.ok(!Object.values(STATUS_FOR_STAGE).includes("PAID"));
    assert.deepEqual(STATUS_FOR_STAGE, {
      dispatched: "DISPATCHED",
      out_for_delivery: "OUT_FOR_DELIVERY",
      delivered: "DELIVERED",
      cancelled: "CANCELLED",
    });
  });
});

/** ------------------------------------------------------------------ */

describe("WhatsApp templates", () => {
  it("names exactly the six templates the lifecycle has milestones for", () => {
    assert.deepEqual(TEMPLATE_NAME, {
      ORDER_PLACED: "order_placed_customer",
      NEW_VENDOR_ORDER: "new_order_vendor",
      ORDER_DISPATCHED: "order_dispatched_customer",
      OUT_FOR_DELIVERY: "order_out_for_delivery_customer",
      ORDER_DELIVERED: "order_delivered_customer",
      ORDER_CANCELLED: "order_cancelled_customer",
    });
  });

  it("has no template for a status that does not exist", () => {
    const names = Object.values(TEMPLATE_NAME).join(" ");
    for (const banned of ["accepted", "preparing", "ready"]) {
      assert.ok(!names.includes(banned), `there must be no ${banned} template`);
    }
  });

  it("labels every message type distinctly for the admin page", () => {
    const labels = ALL_MESSAGE_TYPES.map((type) => MESSAGE_TYPE_LABEL[type]);
    for (const label of labels) assert.ok(label.length > 0);
    assert.equal(new Set(labels).size, labels.length, "labels must be distinct");
  });

  it("passes the customer's order confirmation five parameters, in the documented order", () => {
    const params = bodyParameters({
      type: "ORDER_PLACED",
      vars: {
        customerName: "Asha",
        orderId: "QN-AB23CD",
        orderItems: "• Basin mixer × 1",
        totalAmount: "12,400",
        deliveryAddress: "Asha, 14 Civil Lines, Gorakhpur, Uttar Pradesh 273001",
      },
    });

    assert.deepEqual(params, [
      "Asha",
      "QN-AB23CD",
      "• Basin mixer × 1",
      "12,400",
      "Asha, 14 Civil Lines, Gorakhpur, Uttar Pradesh 273001",
    ]);
  });

  it("passes the vendor eight parameters and puts the dispatch link on the button, not the body", () => {
    const message = {
      type: "NEW_VENDOR_ORDER" as const,
      vars: {
        orderId: "QN-AB23CD",
        customerName: "Asha",
        customerPhone: "+919876543210",
        orderItems: "• Basin mixer × 1",
        quantities: "1 × Basin mixer",
        totalAmount: "4,200",
        paymentStatus: "Paid",
        deliveryAddress: "Asha, 14 Civil Lines, Gorakhpur",
        dispatchPath: "https://quoin.example/vendor/orders/abc",
      },
    };

    const params = bodyParameters(message);
    assert.equal(params.length, 8);
    assert.ok(
      !params.some((p) => p.includes("http")),
      "a URL in a body parameter is rejected by Meta on most templates",
    );
    assert.equal(buttonUrlSuffix(message), "https://quoin.example/vendor/orders/abc");
  });

  it("gives the three one-line customer updates a single parameter: the order reference", () => {
    for (const type of ["ORDER_DISPATCHED", "OUT_FOR_DELIVERY", "ORDER_DELIVERED"] as const) {
      assert.deepEqual(
        bodyParameters({ type, vars: { orderId: "QN-AB23CD" } }),
        ["QN-AB23CD"],
        `${type} should take only the reference`,
      );
    }
  });

  it("gives only the vendor's template a button", () => {
    assert.equal(buttonUrlSuffix({ type: "ORDER_DISPATCHED", vars: { orderId: "X" } }), null);
    assert.equal(
      buttonUrlSuffix({ type: "ORDER_CANCELLED", vars: { orderId: "X", refundNote: "n" } }),
      null,
    );
  });

  it("renders the customer's confirmation with the order reference, items, total and address", () => {
    const body = renderBody({
      type: "ORDER_PLACED",
      vars: {
        customerName: "Asha",
        orderId: "QN-AB23CD",
        orderItems: "• Basin mixer × 1",
        totalAmount: "12,400",
        deliveryAddress: "14 Civil Lines, Gorakhpur",
      },
    });

    assert.match(body, /ORDER CONFIRMED/);
    assert.match(body, /Hi Asha,/);
    assert.match(body, /#QN-AB23CD/);
    assert.match(body, /• Basin mixer × 1/);
    assert.match(body, /₹12,400/);
    assert.match(body, /14 Civil Lines, Gorakhpur/);
  });

  it("renders exactly one rupee symbol per amount — the copy supplies it, not the variable", () => {
    const body = renderBody({
      type: "ORDER_PLACED",
      vars: {
        customerName: "Asha",
        orderId: "Q",
        orderItems: "x",
        totalAmount: "12,400",
        deliveryAddress: "a",
      },
    });
    assert.equal((body.match(/₹/g) ?? []).length, 1);
  });

  it("renders the vendor's message with their picking list and no customer email", () => {
    const body = renderBody({
      type: "NEW_VENDOR_ORDER",
      vars: {
        orderId: "QN-AB23CD",
        customerName: "Asha",
        customerPhone: "+919876543210",
        orderItems: "• Basin mixer × 2",
        quantities: "2 × Basin mixer",
        totalAmount: "4,200",
        paymentStatus: "Paid",
        deliveryAddress: "14 Civil Lines, Gorakhpur",
        dispatchPath: "https://quoin.example/vendor/orders/abc",
      },
    });

    assert.match(body, /NEW QUOIN ORDER/);
    assert.match(body, /Order: #QN-AB23CD/);
    assert.match(body, /2 × Basin mixer/);
    assert.match(body, /NEW ORDER/);
    assert.match(body, /https:\/\/quoin\.example\/vendor\/orders\/abc/);
    /* No accept step to mention — the vendor's only action is dispatch. */
    assert.ok(!/accept/i.test(body));
  });

  it("renders every message type without throwing, and never empty", () => {
    const messages = [
      {
        type: "ORDER_PLACED" as const,
        vars: { customerName: "A", orderId: "Q", orderItems: "i", totalAmount: "1", deliveryAddress: "d" },
      },
      {
        type: "NEW_VENDOR_ORDER" as const,
        vars: {
          orderId: "Q",
          customerName: "A",
          customerPhone: "p",
          orderItems: "i",
          quantities: "q",
          totalAmount: "1",
          paymentStatus: "Paid",
          deliveryAddress: "d",
          dispatchPath: "u",
        },
      },
      { type: "ORDER_DISPATCHED" as const, vars: { orderId: "Q" } },
      { type: "OUT_FOR_DELIVERY" as const, vars: { orderId: "Q" } },
      { type: "ORDER_DELIVERED" as const, vars: { orderId: "Q" } },
      { type: "ORDER_CANCELLED" as const, vars: { orderId: "Q", refundNote: "n" } },
    ];

    for (const message of messages) {
      const body = renderBody(message);
      assert.ok(body.length > 0, `${message.type} rendered empty`);
      assert.ok(bodyParameters(message).length > 0, `${message.type} has no parameters`);
    }
    assert.equal(messages.length, ALL_MESSAGE_TYPES.length, "a message type is untested");
  });
});

/** ------------------------------------------------------------------ */

describe("which milestones the customer actually hears about", () => {
  it("messages the customer for exactly four statuses, and no others", () => {
    const messaged = ALL_STATUSES.filter((status) => messageTypeForStatus(status) !== null).sort();
    assert.deepEqual(messaged, ["CANCELLED", "DELIVERED", "DISPATCHED", "OUT_FOR_DELIVERY"]);
  });

  it("sends nothing for the retired statuses — these were accepted, preparing and ready", () => {
    for (const status of RETIRED_FULFILMENT_STATUSES) {
      assert.equal(
        messageTypeForStatus(status),
        null,
        `${status} must not produce a customer message`,
      );
    }
  });

  it("sends nothing on PAID from the status notifier — onOrderPlaced owns that moment", () => {
    /* `PAID` also has to create vendor fulfilments and message each
       vendor, which a status notifier has no business doing. One owner
       per moment. */
    assert.equal(messageTypeForStatus("PAID"), null);
  });

  it("sends nothing while a payment is still in flight", () => {
    assert.equal(messageTypeForStatus("PENDING_PAYMENT"), null);
    assert.equal(messageTypeForStatus("FAILED"), null);
  });

  it("leaves the refund conversation to the existing refund implementation", () => {
    assert.equal(messageTypeForStatus("REFUND_PENDING"), null);
    assert.equal(messageTypeForStatus("REFUNDED"), null);
  });

  it("maps each messaged status to its own template", () => {
    assert.equal(messageTypeForStatus("DISPATCHED"), "ORDER_DISPATCHED");
    assert.equal(messageTypeForStatus("OUT_FOR_DELIVERY"), "OUT_FOR_DELIVERY");
    assert.equal(messageTypeForStatus("DELIVERED"), "ORDER_DELIVERED");
    assert.equal(messageTypeForStatus("CANCELLED"), "ORDER_CANCELLED");
  });
});

/** ------------------------------------------------------------------ */

describe("idempotency — the event key is what stops a duplicate message", () => {
  it("gives one order's one milestone one key, however many times it is derived", () => {
    /* The Razorpay webhook and the payment reconciler settle identically
       and both call into the sender. Two different keys for the same
       event would message the customer twice. */
    assert.equal(
      customerEventKey("QN-AB23CD", "ORDER_PLACED"),
      customerEventKey("QN-AB23CD", "ORDER_PLACED"),
    );
    assert.equal(customerEventKey("QN-AB23CD", "ORDER_PLACED"), "QN-AB23CD:ORDER_PLACED");
  });

  it("keys each milestone separately, so dispatch does not suppress delivery", () => {
    const keys = ALL_MESSAGE_TYPES.map((type) => customerEventKey("QN-AB23CD", type));
    assert.equal(new Set(keys).size, keys.length, "two milestones share a key");
  });

  it("keys each order separately, so one customer's message does not suppress another's", () => {
    assert.notEqual(
      customerEventKey("QN-AB23CD", "ORDER_PLACED"),
      customerEventKey("QN-ZZ99YY", "ORDER_PLACED"),
    );
  });

  it("gives each vendor on a split order its own key", () => {
    /* Two vendors on one order must each be told exactly once — a single
       shared key would message the first and silently skip the second. */
    const a = vendorEventKey("QN-AB23CD", "GKP-01", "ful_1");
    const b = vendorEventKey("QN-AB23CD", "GKP-02", "ful_2");
    assert.notEqual(a, b);
  });

  it("distinguishes two legs even when both stores snapshot as 'unknown'", () => {
    /* `storeCode` is a snapshot and reads "unknown" for a store row that
       has gone away. Without the fulfilment id in the key, two such legs
       would collide and the second vendor would never be messaged. */
    assert.notEqual(
      vendorEventKey("QN-AB23CD", "unknown", "ful_1"),
      vendorEventKey("QN-AB23CD", "unknown", "ful_2"),
    );
  });

  it("never collides a vendor key with a customer key", () => {
    const customer = ALL_MESSAGE_TYPES.map((type) => customerEventKey("QN-AB23CD", type));
    const vendor = vendorEventKey("QN-AB23CD", "GKP-01", "ful_1");
    assert.ok(!customer.includes(vendor));
  });
});

/** ------------------------------------------------------------------ */

describe("the WhatsApp column on the order queue", () => {
  it("says 'none' when nothing has been attempted — correct for an unpaid order, not a problem", () => {
    assert.equal(summariseWhatsApp([]), "none");
  });

  it("says 'ok' only when every message was sent", () => {
    assert.equal(summariseWhatsApp(["SENT"]), "ok");
    assert.equal(summariseWhatsApp(["SENT", "SENT", "SENT"]), "ok");
  });

  it("lets one failure win over any number of successes", () => {
    /* The whole point of the column: the thing worth surfacing is the
       message that did not arrive. */
    assert.equal(summariseWhatsApp(["SENT", "SENT", "FAILED", "SENT"]), "failed");
    assert.equal(summariseWhatsApp(["FAILED", "PENDING", "SENT"]), "failed");
  });

  it("reports in-flight work when there is no failure", () => {
    assert.equal(summariseWhatsApp(["SENT", "PENDING"]), "pending");
    assert.equal(summariseWhatsApp(["SENT", "RETRYING"]), "pending");
  });
});

/** ------------------------------------------------------------------ */

describe("vendor dispatch links", () => {
  it("refuses a token of the wrong shape without going near the database", async () => {
    /* There is no database in this test run. If the shape guard were
       absent this would try to query one and fail rather than resolve
       null, which is exactly what the assertion is checking. */
    const cases = [
      "",
      "not-a-token",
      "abc",
      "A".repeat(64), // uppercase hex is not what randomBytes().toString("hex") produces
      "z".repeat(64), // not hex
      "a".repeat(63), // too short
      "a".repeat(65), // too long
      "'; DROP TABLE orders; --",
    ];

    for (const token of cases) {
      assert.equal(
        await getFulfilmentByToken(token),
        null,
        `token ${JSON.stringify(token.slice(0, 12))} should be refused by shape alone`,
      );
    }
  });
});
