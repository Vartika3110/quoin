import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { decodeHookSecret, parseSmsHookPayload, SmsHookError, verifySmsHookSignature } =
  await import("@/lib/auth/sms-hook");

/**
 * The Send SMS Hook's signature check.
 *
 * This is the whole security boundary on `/api/v1/auth/supabase/send-otp`
 * — a public, unauthenticated endpoint that sends a WhatsApp message to
 * whatever number the body names. Without the check, anyone who found
 * the URL could message strangers a code and bill it to the WhatsApp
 * account. It carried no tests when it was first written, was deleted,
 * and is now back for a second delivery channel, which is a good moment
 * to stop taking it on trust.
 */

const SECRET = `v1,whsec_${Buffer.from("a-test-signing-key-of-some-length").toString("base64")}`;

function sign(body: string, id: string, timestamp: string, secret = SECRET) {
  const mac = createHmac("sha256", decodeHookSecret(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return `v1,${mac}`;
}

function headersFor(body: string, over: Partial<Record<string, string>> = {}, now = Date.now()) {
  const id = over.id ?? "msg_test_1";
  const timestamp = over.timestamp ?? String(Math.floor(now / 1000));
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": over.signature ?? sign(body, id, timestamp),
  });
}

const BODY = JSON.stringify({ user: { phone: "+919876543210" }, sms: { otp: "123456" } });

describe("send-otp hook signature", () => {
  it("accepts a genuine delivery", () => {
    const now = Date.now();
    assert.doesNotThrow(() =>
      verifySmsHookSignature({ secret: SECRET, rawBody: BODY, headers: headersFor(BODY, {}, now), now }),
    );
  });

  it("tolerates the secret with or without its display prefixes", () => {
    /* Supabase's dashboard copies this value inconsistently — sometimes
       with `v1,`, sometimes with `whsec_`, sometimes neither. Getting it
       wrong fails every delivery with nothing to say why. */
    const bare = SECRET.replace(/^v1,whsec_/, "");
    assert.deepEqual(decodeHookSecret(SECRET), decodeHookSecret(bare));
    assert.deepEqual(decodeHookSecret(SECRET), decodeHookSecret(`whsec_${bare}`));
  });

  it("refuses a body that changed after signing", () => {
    const now = Date.now();
    const headers = headersFor(BODY, {}, now);
    const tampered = JSON.stringify({ user: { phone: "+919999999999" }, sms: { otp: "123456" } });
    assert.throws(
      () => verifySmsHookSignature({ secret: SECRET, rawBody: tampered, headers, now }),
      SmsHookError,
    );
  });

  it("refuses a signature made with another secret", () => {
    const now = Date.now();
    const other = `v1,whsec_${Buffer.from("a-different-key-entirely-here").toString("base64")}`;
    const id = "msg_test_1";
    const timestamp = String(Math.floor(now / 1000));
    const headers = new Headers({
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": sign(BODY, id, timestamp, other),
    });
    assert.throws(() => verifySmsHookSignature({ secret: SECRET, rawBody: BODY, headers, now }), SmsHookError);
  });

  it("refuses a replay from outside the tolerance window", () => {
    /* Without this an intercepted delivery stays replayable forever, and
       replaying this one re-sends a message on demand. */
    const now = Date.now();
    const old = String(Math.floor(now / 1000) - 10 * 60);
    const headers = headersFor(BODY, { timestamp: old, signature: sign(BODY, "msg_test_1", old) }, now);
    assert.throws(() => verifySmsHookSignature({ secret: SECRET, rawBody: BODY, headers, now }), SmsHookError);
  });

  it("accepts one good signature among several, so a secret can be rotated", () => {
    const now = Date.now();
    const id = "msg_test_1";
    const timestamp = String(Math.floor(now / 1000));
    const headers = new Headers({
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,AAAAinvalid ${sign(BODY, id, timestamp)}`,
    });
    assert.doesNotThrow(() => verifySmsHookSignature({ secret: SECRET, rawBody: BODY, headers, now }));
  });

  it("refuses a delivery with no signature headers at all", () => {
    assert.throws(
      () => verifySmsHookSignature({ secret: SECRET, rawBody: BODY, headers: new Headers() }),
      SmsHookError,
    );
  });
});

describe("send-otp hook payload", () => {
  it("reads the phone and the code", () => {
    assert.deepEqual(parseSmsHookPayload(JSON.parse(BODY)), {
      user: { phone: "+919876543210" },
      sms: { otp: "123456" },
    });
  });

  it("refuses a code that is not a string", () => {
    /* The reason this is validated rather than cast: a non-string `otp`
       interpolates `undefined` into a real message sent to a real
       customer. */
    assert.throws(
      () => parseSmsHookPayload({ user: { phone: "+919876543210" }, sms: { otp: 123456 } }),
      SmsHookError,
    );
  });

  it("refuses a payload with no phone", () => {
    assert.throws(() => parseSmsHookPayload({ sms: { otp: "123456" } }), SmsHookError);
  });

  it("refuses something that is not an object", () => {
    assert.throws(() => parseSmsHookPayload("nope"), SmsHookError);
    assert.throws(() => parseSmsHookPayload(null), SmsHookError);
  });
});
