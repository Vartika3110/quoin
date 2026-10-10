import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks signature verification, for Supabase's Send SMS Hook.
 *
 * Supabase signs the hook the way it signs every webhook it sends:
 * the Standard Webhooks scheme (standardwebhooks.com). Three headers
 * carry it —
 *
 *   webhook-id         an opaque delivery id
 *   webhook-timestamp  unix seconds
 *   webhook-signature  one or more space-separated `v1,<base64>` pairs
 *
 * — and the signed content is literally `${id}.${timestamp}.${body}`,
 * over the *raw* bytes of the body. Re-serialising parsed JSON changes
 * key order and whitespace and fails every legitimate delivery, which is
 * the same trap the Razorpay webhook documents.
 *
 * This endpoint is the one place in the app that will send an SMS to an
 * arbitrary number on an unauthenticated request's say-so, so the
 * verification is the whole security boundary: without it, anyone who
 * found the URL could bill the MSG91 account and text strangers a code.
 */

/** How far out of date a delivery may be before it is refused. */
const TOLERANCE_SECONDS = 5 * 60;

export class SmsHookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsHookError";
  }
}

/**
 * The secret, as bytes.
 *
 * Supabase shows it as `v1,whsec_<base64>`; the dashboard sometimes
 * copies with the `v1,` and sometimes without, and the `whsec_` prefix is
 * part of the display format rather than the key. Both are stripped and
 * the remainder is base64 — getting this wrong produces a signature
 * mismatch on every delivery with nothing to say why, so it is handled
 * here once rather than left to whoever pastes the value.
 */
export function decodeHookSecret(raw: string): Buffer {
  const cleaned = raw.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.length === 0) {
    throw new SmsHookError("SUPABASE_SMS_HOOK_SECRET is not valid base64");
  }
  return bytes;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Throws unless the delivery is genuinely from Supabase and recent.
 *
 * The timestamp check is not ceremony: without it a single intercepted
 * delivery stays replayable for ever, and replaying this one means
 * re-sending an SMS on demand.
 */
export function verifySmsHookSignature({
  secret,
  rawBody,
  headers,
  now = Date.now(),
}: {
  secret: string;
  rawBody: string;
  headers: Headers;
  now?: number;
}): void {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");

  if (!id || !timestamp || !signature) {
    throw new SmsHookError("Missing webhook signature headers");
  }

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) {
    throw new SmsHookError("Malformed webhook timestamp");
  }

  const driftSeconds = Math.abs(now / 1000 - sent);
  if (driftSeconds > TOLERANCE_SECONDS) {
    throw new SmsHookError("Webhook timestamp outside tolerance");
  }

  const expected = createHmac("sha256", decodeHookSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  /* The header may carry several versions, space separated, so that a
     secret can be rotated without dropping deliveries. Any one matching
     is a pass; only `v1` is understood. */
  const matched = signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .some((part) => safeEqual(part.slice(3), expected));

  if (!matched) {
    throw new SmsHookError("Webhook signature does not match");
  }
}

/**
 * Both fields non-optional: this type describes the payload *after*
 * `parseSmsHookPayload` has checked it, so an optional `phone` here would
 * push a `string | undefined` into the caller for a value that cannot be
 * undefined by then.
 */
export interface SmsHookPayload {
  user: { phone: string };
  sms: { otp: string };
}

/**
 * Reads the two fields this app needs out of the hook body.
 *
 * Validated rather than cast. The body arrives from the network, and an
 * `otp` that is not a string is a template interpolation of `undefined`
 * into a real SMS sent to a real customer.
 */
export function parseSmsHookPayload(body: unknown): SmsHookPayload {
  if (!body || typeof body !== "object") {
    throw new SmsHookError("Malformed hook payload");
  }
  const record = body as Record<string, unknown>;

  const user = record.user as Record<string, unknown> | undefined;
  const sms = record.sms as Record<string, unknown> | undefined;

  const phone = user?.phone;
  const otp = sms?.otp;

  if (typeof phone !== "string" || !phone) {
    throw new SmsHookError("Hook payload has no phone");
  }
  if (typeof otp !== "string" || !otp) {
    throw new SmsHookError("Hook payload has no code");
  }

  return { user: { phone }, sms: { otp } };
}
