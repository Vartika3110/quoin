import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — same setup as the other suites. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { check } = await import("@/lib/rate-limit");

/**
 * The two checkout writes are bounded.
 *
 * `checkout/quote` was limited from the start because it is open to
 * guests. `checkout/order` and `checkout/verify` were not, on the
 * reasoning that `requireUser()` already costs an attacker a phone
 * number. A launch audit called that wrong: ordering reserves stock and
 * opens an order at Razorpay, and both are reachable with one account.
 *
 * These tests pin the two things worth pinning — that a bucket refuses
 * once its allowance is spent, and that two accounts do not share one
 * allowance. The exact ceilings are a judgement call documented in
 * `rate-limit.ts`; what must not regress is that they exist and are per
 * caller.
 *
 * `check()` rather than `enforceKeyed()` throughout: the throwing
 * wrapper is three lines over this and asserting on it would be
 * asserting on `ApiError`'s message, which is copy.
 */
describe("checkout rate limits", () => {
  it("allows a realistic run of orders and then refuses", () => {
    const key = `u:${crypto.randomUUID()}`;

    /* Twelve in ten minutes. A contractor ordering for three sites in
       one sitting is real; a dozen is not. */
    for (let i = 0; i < 12; i++) {
      assert.equal(
        check("checkoutOrder", key).allowed,
        true,
        `order ${i + 1} of 12 should be allowed`,
      );
    }

    const refused = check("checkoutOrder", key);
    assert.equal(refused.allowed, false, "the thirteenth order is refused");
    assert.ok(
      refused.retryAfterSeconds > 0,
      "a refusal says how long to wait, so the customer gets a number rather than 'later'",
    );
  });

  it("allows retries on a dropped handoff and then refuses", () => {
    const key = `u:${crypto.randomUUID()}`;

    /* Verify is called once per completed payment. Twenty leaves room
       for a bad connection and none for a script. */
    for (let i = 0; i < 20; i++) {
      assert.equal(check("checkoutVerify", key).allowed, true);
    }

    assert.equal(check("checkoutVerify", key).allowed, false);
  });

  it("counts each account separately", () => {
    /* The point of keying by account rather than by address: a site hut
       behind one connection is several real customers, and one of them
       spending their allowance must not close checkout for the rest. */
    const spent = `u:${crypto.randomUUID()}`;
    const fresh = `u:${crypto.randomUUID()}`;

    for (let i = 0; i < 12; i++) check("checkoutOrder", spent);
    assert.equal(check("checkoutOrder", spent).allowed, false);

    assert.equal(
      check("checkoutOrder", fresh).allowed,
      true,
      "a second account still has its own allowance",
    );
  });

  it("keeps the two checkout buckets independent", () => {
    /* Spending one must not close the other: a customer who has just
       placed their last allowed order still has to be able to verify
       the payment for it. */
    const key = `u:${crypto.randomUUID()}`;

    for (let i = 0; i < 12; i++) check("checkoutOrder", key);
    assert.equal(check("checkoutOrder", key).allowed, false);

    assert.equal(
      check("checkoutVerify", key).allowed,
      true,
      "verifying is still possible after the order allowance is spent",
    );
  });
});
