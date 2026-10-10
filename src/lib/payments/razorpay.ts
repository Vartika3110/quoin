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

/** ---- Reading back what the gateway thinks happened ---------------------- */

/** One payment attempt against a gateway order, as Razorpay reports it. */
export interface GatewayPayment {
  id: string;
  /** `created` | `authorized` | `captured` | `refunded` | `failed`. */
  status: string;
  amountPaise: number;
  method?: string;
}

/**
 * Every payment attempt Razorpay has recorded against one gateway order.
 *
 * This exists for exactly one caller: the reconciler
 * (`/api/v1/cron/reconcile-payments`), which asks the gateway directly
 * about orders whose webhook never arrived.
 *
 * It is a *second* authority on payment, and that is a deliberate and
 * narrow exception to the rule the webhook handler states — "only
 * `payment.captured` moves an order to PAID". The rule's real content is
 * that a customer's browser is never authority, because it is a channel
 * the customer controls. This is not that channel: it is this server
 * asking Razorpay's own API, authenticated with the account's secret,
 * and the answer cannot be forged by anyone who is not Razorpay. The
 * webhook stays the fast path; this is the one that notices when the
 * fast path has been silently failing.
 *
 * Returns the raw list rather than "is it paid": deciding which attempt
 * counts is the caller's business, and a gateway order can carry a failed
 * attempt and a captured one at the same time.
 */
export async function fetchGatewayPayments(
  providerOrderId: string,
): Promise<GatewayPayment[]> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  let res: Response;
  try {
    res = await fetch(
      `${API}/orders/${encodeURIComponent(providerOrderId)}/payments`,
      {
        headers: { Authorization: authHeader() },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (error) {
    throw new RazorpayError(
      `Could not reach Razorpay: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const description =
      (body as { error?: { description?: string } } | null)?.error?.description ??
      "unknown error";
    throw new RazorpayError(
      `Razorpay rejected the payments lookup: ${description}`,
      res.status,
    );
  }

  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    throw new RazorpayError("Razorpay returned payments in an unexpected shape");
  }

  /* Anything that is not a well-formed payment entity is dropped rather
     than throwing the whole lookup away: one malformed row must not stop
     a genuine capture sitting next to it from being settled. */
  const out: GatewayPayment[] = [];
  for (const item of items) {
    const p = item as { id?: unknown; status?: unknown; amount?: unknown; method?: unknown };
    if (typeof p.id !== "string" || typeof p.status !== "string") continue;
    if (typeof p.amount !== "number") continue;
    out.push({
      id: p.id,
      status: p.status,
      amountPaise: p.amount,
      method: typeof p.method === "string" ? p.method : undefined,
    });
  }
  return out;
}

/** ---- Refunds ------------------------------------------------------------ */

export interface GatewayRefund {
  /** Razorpay's `rfnd_XXXXXXXX`. */
  id: string;
  amountPaise: number;
  /** `pending` | `processed` | `failed`. */
  status: string;
}

/**
 * Sends money back for a captured payment.
 *
 * **Idempotent by `speed: "normal"` and an explicit key.** Razorpay
 * honours an `Idempotency-Key` header on refunds, and this is the one
 * call in the app where a retry without it is unambiguously bad: a
 * timeout that is actually a success, retried, refunds the customer
 * twice. The caller passes the `Refund` row's own id, which exists
 * before the call is made precisely so there is a stable key to send.
 *
 * `speed: "normal"` rather than `"optimum"` — optimum costs more and
 * buys a faster-looking refund for the customer, which is a commercial
 * decision nobody has made. Normal is the default and the honest one to
 * start with.
 *
 * A partial refund is possible (`amountPaise` below the captured total)
 * and is passed through, because a damaged single line out of six is a
 * real case. Omitting it refunds the lot, which is Razorpay's own
 * default and not something to re-implement here.
 */
export async function createGatewayRefund(input: {
  providerPaymentId: string;
  /** Omit to refund the whole captured amount. */
  amountPaise?: number;
  /** The `Refund` row's id — see the note on idempotency above. */
  idempotencyKey: string;
  notes?: Record<string, string>;
}): Promise<GatewayRefund> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  let res: Response;
  try {
    res = await fetch(
      `${API}/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(),
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          ...(input.amountPaise != null ? { amount: input.amountPaise } : {}),
          speed: "normal",
          notes: input.notes ?? {},
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (error) {
    /* Unlike `createGatewayOrder`, a timeout here is **not** safe to read
       as "nothing happened". The request may well have been received and
       the refund created, and the caller must leave its `Refund` row
       PENDING and reconcile rather than retry blindly — which is why
       this throws a typed error the caller can tell apart from a
       rejection. */
    throw new RazorpayError(
      `Could not reach Razorpay: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const description =
      (body as { error?: { description?: string } } | null)?.error?.description ??
      "unknown error";
    throw new RazorpayError(`Razorpay rejected the refund: ${description}`, res.status);
  }

  const refund = body as { id?: unknown; amount?: unknown; status?: unknown } | null;
  if (
    typeof refund?.id !== "string" ||
    typeof refund.amount !== "number" ||
    typeof refund.status !== "string"
  ) {
    throw new RazorpayError("Razorpay returned a refund in an unexpected shape");
  }

  return { id: refund.id, amountPaise: refund.amount, status: refund.status };
}
