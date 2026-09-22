import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — see tests/unit.test.mts for why these
   two are set even though nothing this file imports touches auth or
   payments directly; `confirmation-copy.ts`'s only real dependency,
   `@/lib/orders/status-groups`, is itself env-free, but this keeps the
   file safe against that changing without anyone noticing here. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { confirmationCopy } = await import(
  "@/components/storefront/checkout/confirmation-copy"
);
const { MONEY_MOVED_STATUSES } = await import("@/lib/orders/status-groups");

const REF = "QO12345678";

describe("confirmationCopy — callback", () => {
  it("is always a success, names the reference, and never promises a time beyond the hour", () => {
    const copy = confirmationCopy({
      kind: "callback",
      reference: REF,
      status: null,
      verified: false,
      pollingExhausted: false,
    });
    assert.equal(copy.tone, "success");
    assert.equal(copy.heading, "Your order is with us");
    assert.match(copy.detail, new RegExp(REF));
    assert.match(copy.detail, /within the hour/);
    assert.match(copy.detail, /Nothing has been charged yet/);
  });

  it("ignores verified/status/pollingExhausted entirely — a callback order never had a gateway to check", () => {
    const withNoise = confirmationCopy({
      kind: "callback",
      reference: REF,
      status: "PAID",
      verified: true,
      pollingExhausted: true,
    });
    const clean = confirmationCopy({
      kind: "callback",
      reference: REF,
      status: null,
      verified: false,
      pollingExhausted: false,
    });
    assert.deepEqual(withNoise, clean);
  });
});

describe("confirmationCopy — online, paid", () => {
  it("is a success once the status has actually moved, for every status that counts as moved", () => {
    for (const status of MONEY_MOVED_STATUSES) {
      const copy = confirmationCopy({
        kind: "online",
        reference: REF,
        status,
        verified: true,
        pollingExhausted: false,
      });
      assert.equal(copy.tone, "success", `expected ${status} to read as paid`);
      assert.equal(copy.heading, "Payment successful");
      assert.equal(copy.detail, `Order ${REF} is paid.`);
    }
  });

  it("wins over an unverified handoff and an exhausted poll — the status itself outranks both", () => {
    const copy = confirmationCopy({
      kind: "online",
      reference: REF,
      status: "PAID",
      verified: false,
      pollingExhausted: true,
    });
    assert.equal(copy.tone, "success");
    assert.equal(copy.heading, "Payment successful");
  });
});

describe("confirmationCopy — online, not (yet) paid", () => {
  it("is a warning when the handoff itself never verified, regardless of polling", () => {
    const copy = confirmationCopy({
      kind: "online",
      reference: REF,
      status: null,
      verified: false,
      pollingExhausted: false,
    });
    assert.equal(copy.tone, "warning");
    assert.equal(copy.heading, "We couldn't confirm your payment yet");
    assert.match(copy.detail, new RegExp(REF));
    assert.match(copy.detail, /contact support/);
  });

  it("stays a warning even once polling has exhausted — verification, not polling, is the gate", () => {
    const copy = confirmationCopy({
      kind: "online",
      reference: REF,
      status: "PENDING_PAYMENT",
      verified: false,
      pollingExhausted: true,
    });
    assert.equal(copy.tone, "warning");
  });

  it("is pending, not yet exhausted, once verified but still unpaid", () => {
    const copy = confirmationCopy({
      kind: "online",
      reference: REF,
      status: "PENDING_PAYMENT",
      verified: true,
      pollingExhausted: false,
    });
    assert.equal(copy.tone, "pending");
    assert.equal(copy.heading, "Payment received — confirming your order");
    assert.equal(copy.detail, "This usually finishes within moments.");
  });

  it("is pending with the exhausted copy once the poll budget runs out", () => {
    const copy = confirmationCopy({
      kind: "online",
      reference: REF,
      status: "PENDING_PAYMENT",
      verified: true,
      pollingExhausted: true,
    });
    assert.equal(copy.tone, "pending");
    assert.equal(copy.heading, "Payment is being confirmed");
    assert.match(copy.detail, /updates on its own/);
    assert.match(copy.detail, /contact support/);
  });

  it("treats a null status the same as any other not-yet-moved status", () => {
    const withNull = confirmationCopy({
      kind: "online",
      reference: REF,
      status: null,
      verified: true,
      pollingExhausted: false,
    });
    const withKnownUnpaid = confirmationCopy({
      kind: "online",
      reference: REF,
      status: "PENDING_PAYMENT",
      verified: true,
      pollingExhausted: false,
    });
    assert.deepEqual(withNull, withKnownUnpaid);
  });

  it("treats a status it does not recognise as not yet moved rather than throwing", () => {
    assert.doesNotThrow(() =>
      confirmationCopy({
        kind: "online",
        reference: REF,
        status: "SOME_FUTURE_STATUS",
        verified: true,
        pollingExhausted: false,
      }),
    );
    const copy = confirmationCopy({
      kind: "online",
      reference: REF,
      status: "SOME_FUTURE_STATUS",
      verified: true,
      pollingExhausted: false,
    });
    assert.equal(copy.tone, "pending");
  });
});

describe("confirmationCopy — every branch returns exactly one tone", () => {
  it("never mixes a warning heading with a success or pending tone, or vice versa", () => {
    const cases: Array<Parameters<typeof confirmationCopy>[0]> = [
      { kind: "callback", reference: REF, status: null, verified: false, pollingExhausted: false },
      { kind: "online", reference: REF, status: "PAID", verified: true, pollingExhausted: false },
      { kind: "online", reference: REF, status: null, verified: false, pollingExhausted: false },
      { kind: "online", reference: REF, status: null, verified: true, pollingExhausted: false },
      { kind: "online", reference: REF, status: null, verified: true, pollingExhausted: true },
    ];
    const tones = cases.map((c) => confirmationCopy(c).tone);
    assert.deepEqual(tones, ["success", "success", "warning", "pending", "pending"]);
  });
});
