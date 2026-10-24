import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — same setup as the other suites. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

/**
 * The gate that stops Quoin taking money it cannot settle.
 *
 * Context, because the rule looks over-strict without it. The Razorpay
 * webhook is the only authority that moves an order to PAID — the browser
 * handoff deliberately has no write path. So a deployment holding
 * `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` but no
 * `RAZORPAY_WEBHOOK_SECRET` will happily open a checkout, charge a real
 * card, and then reject the delivery that was supposed to record it.
 *
 * That is not a hypothetical: 45 of the first 46 deliveries this
 * application ever received were rejected for an invalid signature, over
 * a period of weeks, while checkout went on offering online payment. The
 * orders are still in the database at PENDING_PAYMENT.
 *
 * `isRazorpayConfigured()` therefore requires all three, and the effect
 * is that checkout falls back to "Confirm with an expert" rather than
 * taking an unsettleable payment. These tests pin that, because the
 * obvious "tidy-up" is to drop the third check as unrelated to opening a
 * checkout — which is exactly true and exactly the bug.
 *
 * The rule is tested through `razorpayMissingConfigIn`, which takes the
 * three values as a plain object. `env.ts` validates and freezes its view
 * of `process.env` at import time, so a suite that reads the environment
 * can only ever assert one configuration per process — the first attempt
 * at this file re-imported the module with a cache-busting query string
 * and silently got the same frozen answer for every case, which is a test
 * that passes for the wrong reason.
 */
const { razorpayMissingConfigIn } = await import("@/lib/payments/razorpay");

const FULL = {
  RAZORPAY_KEY_ID: "rzp_test_abcdefghijklmn",
  RAZORPAY_KEY_SECRET: "secret-value-for-tests",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret-for-tests",
};

describe("the Razorpay configuration rule", () => {
  it("is satisfied only when all three variables are set", () => {
    assert.deepEqual(razorpayMissingConfigIn(FULL), []);
  });

  /* The case that cost real money. */
  it("rejects a deploy with both keys but no webhook secret", () => {
    assert.deepEqual(
      razorpayMissingConfigIn({ ...FULL, RAZORPAY_WEBHOOK_SECRET: undefined }),
      ["RAZORPAY_WEBHOOK_SECRET"],
      "a deploy that cannot verify settlement must not offer online payment",
    );
  });

  it("treats an empty string as missing", () => {
    /* The failure that actually happened: the variable was declared and
       its value was zero-length. */
    assert.deepEqual(
      razorpayMissingConfigIn({ ...FULL, RAZORPAY_WEBHOOK_SECRET: "" }),
      ["RAZORPAY_WEBHOOK_SECRET"],
    );
  });

  it("rejects either half of the API key being missing", () => {
    assert.deepEqual(razorpayMissingConfigIn({ ...FULL, RAZORPAY_KEY_ID: undefined }), [
      "RAZORPAY_KEY_ID",
    ]);
    assert.deepEqual(
      razorpayMissingConfigIn({ ...FULL, RAZORPAY_KEY_SECRET: undefined }),
      ["RAZORPAY_KEY_SECRET"],
    );
  });

  it("names every missing variable, not just the first", () => {
    assert.deepEqual(razorpayMissingConfigIn({}), [
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
      "RAZORPAY_WEBHOOK_SECRET",
    ]);
  });

  it("returns names, never values", () => {
    for (const name of razorpayMissingConfigIn({})) {
      assert.match(name, /^[A-Z_]+$/, `"${name}" looks like a value, not a name`);
    }
  });
});
