import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Razorpay, over `fetch`.
 *
 * The official `razorpay` npm package is a thin wrapper over three REST
 * calls and pulls its own HTTP stack in with it. This app has four
 * runtime dependencies and hand-rolls MSG91 for the same reason — see
 * `src/lib/auth/sender.ts`. Two endpoints and one HMAC do not justify a
 * fifth.
 *
 * Razorpay was picked over Stripe because Stripe cannot settle domestic
 * Indian payments, and over Cashfree/PhonePe on documentation quality
 * alone. One thing it gets right is money: its `amount` is an integer in
 * **paise**, which is exactly how this catalogue has always stored
 * prices, so nothing is converted anywhere in this file. A gateway
 * wanting rupee decimals would have introduced float rounding between
 * the quote and the charge.
 */

const API = "https://api.razorpay.com/v1";

/** A hung gateway must become an error, not an open request. */
const TIMEOUT_MS = 10_000;

/**
 * Whether payments can be taken at all.
 *
 * Both halves of the API key are needed: `KEY_ID` alone opens a checkout
 * the server cannot then create an order for. Checked by the route so it
 * can answer "payment is not enabled yet" rather than failing inside an
 * HTTP call.
 */
export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/**
 * The publishable half, for the browser.
 *
 * Returned from the order endpoint rather than inlined at build time so
 * that rotating a key — or moving from `rzp_test_` to `rzp_live_` on
 * activation day — is an environment change and not a redeploy.
 */
export function razorpayKeyId(): string | null {
  return env.RAZORPAY_KEY_ID ?? null;
}

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

function authHeader(): string {
  const pair = `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

export interface GatewayOrder {
  /** Razorpay's `order_id` (`order_XXXXXXXX`). */
  id: string;
  amountPaise: number;
}

/**
 * Creates the gateway-side order the browser checkout opens against.
 *
 * `amountPaise` is passed straight through, unconverted, and is always
 * the figure this server computed — never one the browser sent.
 *
 * Capture mode is *not* set here. It is an account-level setting in the
 * Razorpay dashboard, and the per-request `payment_capture` flag it used
 * to accept is legacy. Leave the account on automatic capture: with
 * manual capture a payment stops at `authorized`, `payment.captured`
 * never fires, and orders stay PENDING_PAYMENT while the customer's money
 * is held — which looks exactly like a broken webhook.
 */
export async function createGatewayOrder(input: {
  amountPaise: number;
  /** The Quoin order reference, so the two systems can be reconciled. */
  receipt: string;
  notes?: Record<string, string>;
}): Promise<GatewayOrder> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  let res: Response;
  try {
    res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        /* Razorpay caps this at 40 characters and rejects longer ones. */
        receipt: input.receipt.slice(0, 40),
        notes: input.notes ?? {},
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    /* A timeout or DNS failure here is safe to surface: no order was
       created, so there is nothing to reconcile and the customer can
       simply try again. */
    throw new RazorpayError(
      `Could not reach Razorpay: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    /* Razorpay's error descriptions are written for integrators and can
       quote the request back. Logged, never returned to the customer. */
    const description =
      (body as { error?: { description?: string } } | null)?.error?.description ??
      "unknown error";
    throw new RazorpayError(`Razorpay rejected the order: ${description}`, res.status);
  }

  const order = body as { id?: unknown; amount?: unknown } | null;
  if (typeof order?.id !== "string" || typeof order.amount !== "number") {
    throw new RazorpayError("Razorpay returned an order in an unexpected shape");
  }

  return { id: order.id, amountPaise: order.amount };
}

/** ---- Signatures --------------------------------------------------------- */

/**
 * Constant-time compare of two hex digests.
 *
 * `timingSafeEqual` throws on a length mismatch rather than returning
 * false, so the lengths are checked first — and a wrong-length signature
 * is rejected before it can reach the comparison at all.
 */
function hexEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifies a webhook delivery.
 *
 * `rawBody` must be the exact bytes Razorpay sent. Parsing the JSON and
 * re-serialising it changes key order and whitespace and breaks the
 * digest — which is why the handler reads `request.text()` and validates
 * against the string, not the object.
 *
 * Returns false when no webhook secret is configured. That is the correct
 * answer rather than an error: an unconfigured deploy cannot distinguish
 * a real delivery from a forged one, and accepting either would let
 * anyone who knows the URL mark any order paid.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return hexEquals(expected, signature);
}

/**
 * Verifies the handoff the browser gets back when checkout closes.
 *
 * Useful for showing a confident confirmation immediately instead of
 * polling. It is **not** authority for marking an order paid: it proves
 * the customer's browser saw a genuine Razorpay response, not that money
 * was captured, and it arrives over a channel the customer controls. Only
 * `payment.captured` on the webhook moves an order to PAID.
 */
export function verifyCheckoutSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");
  return hexEquals(expected, input.signature);
}
