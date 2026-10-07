import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { maskPhone, normalizePhone } from "@/lib/auth/phone";
import { getOtpSender, isOtpDeliveryConfigured } from "@/lib/auth/sender";
import {
  parseSmsHookPayload,
  SmsHookError,
  verifySmsHookSignature,
} from "@/lib/auth/sms-hook";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/supabase/send-sms — Supabase's "Send SMS Hook".
 *
 * Why this exists at all: Supabase can only send phone codes through the
 * providers it supports, and MSG91 is not one of them. India's TRAI
 * requires every transactional SMS to go out under a DLT-registered
 * template, Quoin's is registered with MSG91, and re-registering under
 * Twilio means another approval wait and a materially higher per-message
 * price for Indian traffic.
 *
 * The hook splits the job exactly where it should be split. **Supabase
 * generates the code, stores it, checks it, expires it and counts the
 * attempts** — everything that makes it an auth system. **This app only
 * carries it to the handset**, using the same `OtpSender` the hand-rolled
 * flow used, so the DLT template and the MSG91 account carry on unchanged.
 *
 * Three things make this different from every other route in `/api/v1`:
 *
 * **No session and no `handler()` envelope.** The caller is Supabase.
 * It authenticates with a Standard Webhooks HMAC over the body, and it
 * reads a bare JSON body, not this app's `{ data }` envelope.
 *
 * **The raw body is read before anything is parsed**, because the
 * signature is over the exact bytes — the same reason, and the same
 * trap, as the Razorpay webhook.
 *
 * **A failure here must be a failure.** Unlike the Razorpay webhook,
 * which acknowledges almost everything to stop hours of retries, a
 * non-2xx from this hook is how Supabase learns the code never went out
 * — so it can tell the customer rather than leave them waiting for an
 * SMS that was silently dropped.
 */
export async function POST(request: Request) {
  const secret = env.SUPABASE_SMS_HOOK_SECRET;

  /* Refuses rather than sending unauthenticated. This endpoint texts an
     arbitrary number on request; with no secret configured there is
     nothing separating Supabase from anyone who guessed the URL, and
     "send anyway" would be an open SMS relay billed to the MSG91
     account. */
  if (!secret) {
    console.error("[auth] SMS hook called but SUPABASE_SMS_HOOK_SECRET is unset");
    return NextResponse.json(
      { error: { message: "SMS hook is not configured" } },
      { status: 500 },
    );
  }

  const rawBody = await request.text();

  /* Signature first, before any other check that could answer
     differently depending on configuration. An unauthenticated caller
     probing this endpoint should learn one thing — "no" — and not be
     able to map which integrations are live by reading which 500 comes
     back. The MSG91 check moved below this for that reason. */
  try {
    verifySmsHookSignature({ secret, rawBody, headers: request.headers });
  } catch (error) {
    /* 401 with nothing useful in it. A verification failure is either a
       rotated secret or somebody probing, and neither should be told
       which. */
    console.error(
      "[auth] SMS hook signature rejected",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: { message: "Unauthorized" } },
      { status: 401 },
    );
  }

  /* Past the signature, so this is genuinely Supabase asking. A 500 here
     tells it the code did not go out — which is what it needs to know to
     tell the customer, rather than leaving them waiting for an SMS that
     was silently dropped. */
  if (!isOtpDeliveryConfigured()) {
    console.error("[auth] SMS hook called but MSG91 is not configured");
    return NextResponse.json(
      { error: { message: "SMS delivery is not configured" } },
      { status: 500 },
    );
  }

  let phone: string;
  let code: string;
  try {
    const payload = parseSmsHookPayload(JSON.parse(rawBody));
    /* Through this app's own normaliser, not used as given. Supabase
       stores E.164 without the `+`, and MSG91 wants it without too — but
       going via `normalizePhone` means one definition of a deliverable
       Indian number, and a junk value is refused here rather than paid
       for at the gateway. */
    phone = normalizePhone(payload.user.phone);
    code = payload.sms.otp;
  } catch (error) {
    console.error(
      "[auth] SMS hook payload rejected",
      error instanceof SmsHookError ? error.message : error,
    );
    return NextResponse.json(
      { error: { message: "Bad request" } },
      { status: 400 },
    );
  }

  try {
    await getOtpSender().send(phone, code);
  } catch (error) {
    /* Never logs the code. The number is masked, as everywhere else. */
    console.error(`[auth] SMS hook delivery failed for ${maskPhone(phone)}`, error);
    return NextResponse.json(
      { error: { message: "Delivery failed" } },
      { status: 502 },
    );
  }

  /* Supabase reads an empty object as "delivered, say nothing further". */
  return NextResponse.json({});
}
