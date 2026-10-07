import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { applyDeliveryStatus } from "@/lib/data/whatsapp-notifications";

/**
 * /api/v1/webhooks/whatsapp
 *
 * What Meta says happened to the messages this app sent.
 *
 * Strictly a *reporting* channel, and that distinction is the whole
 * design: nothing here can place, advance, cancel or alter an order.
 * WhatsApp is never the source of truth — Postgres is — so the only
 * column this route can touch is `WhatsAppNotification.status`, turning
 * an optimistic SENT into a FAILED when the provider later says the
 * number was invalid, the user blocked the business, or the template was
 * paused. Without it, a message the Graph API accepted and then dropped
 * looks successful on the admin page forever.
 *
 * Inbound *messages* from customers are deliberately ignored. A customer
 * replying "where is my order" is a support conversation for a person,
 * not an instruction for this server: a webhook that let a WhatsApp
 * message move an order would make WhatsApp the source of truth, by
 * accident, for anyone who can spoof a phone number.
 *
 * Shaped after the Razorpay handler next door, for the same reasons:
 *
 *  - **The raw body is read before anything is parsed.** The signature is
 *    over the exact bytes sent.
 *  - **No `handler()` envelope.** The caller is Meta, which wants a bare
 *    2xx.
 *  - **Almost everything answers 200.** Meta retries a non-2xx with
 *    backoff and disables the subscription after sustained failures. An
 *    unrecognised event, an id this app has no row for and a status it
 *    does not act on are all things retrying cannot fix.
 */

/** As much of Meta's envelope as this route reads. */
interface StatusEntry {
  id?: string;
  status?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

interface WebhookPayload {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: { statuses?: StatusEntry[] };
    }[];
  }[];
}

/**
 * Verifies `X-Hub-Signature-256`, Meta's HMAC-SHA256 of the raw body
 * under the **app secret**.
 *
 * Fails closed when `WHATSAPP_APP_SECRET` is unset, exactly as
 * `verifyWebhookSignature` does for Razorpay: this is a public URL, and
 * "no secret configured" must never mean "trust everybody". The app
 * secret is not the access token — a deploy can hold a valid sending
 * token and still be unable to trust a single incoming delivery, which is
 * why it is a separate variable rather than inferred from the other one.
 */
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;

  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(header.slice(prefix.length), "hex");
  } catch {
    return false;
  }

  /* Length must match before `timingSafeEqual`, which throws on a
     mismatch rather than returning false. */
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/**
 * The subscription handshake.
 *
 * Meta GETs this URL once, with a challenge and the verify token the
 * dashboard was given. Echoing the challenge back as **plain text** (not
 * JSON) is what completes the subscription; anything else fails it.
 *
 * Compared in constant time, and refused outright when the token is
 * unset — the same fail-closed rule as the POST above and as
 * `/api/v1/cron/*`. 403 rather than 200 on a mismatch: this is one of
 * the few rejections worth seeing in the logs, because the usual cause
 * is a token typed into one place and not the other.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected || mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    console.warn("[whatsapp] webhook verification presented the wrong token");
    return new NextResponse("forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  /* Bytes first. Everything below parses this string; the body can only
     be consumed once. */
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    /* 401, and deliberately silent about which of "no secret
       configured" and "bad signature" it was — a handler that
       distinguishes them tells an attacker which deploys are worth
       forging against. */
    console.warn("[whatsapp] rejected a webhook with an invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    /* Signed by us and still not JSON. Retrying will not change that. */
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const statuses = (body.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === undefined || change.field === "messages")
    .flatMap((change) => change.value?.statuses ?? []);

  try {
    for (const status of statuses) {
      if (!status.id || !status.status) continue;
      await applyDeliveryStatus({
        providerMessageId: status.id,
        status: status.status,
        /* Meta's own words, which are the only useful part: "Message
           failed to send because more than 24 hours have passed",
           "Template is paused". `applyDeliveryStatus` truncates. */
        errorMessage:
          status.errors
            ?.map((error) => error.error_data?.details ?? error.message ?? error.title)
            .filter(Boolean)
            .join("; ") || null,
      });
    }
  } catch (error) {
    /* The one case worth a retry: the signature was good and the payload
       understood, but the write did not land. */
    console.error("[whatsapp] failed to apply a delivery status", error);
    return NextResponse.json({ error: "not processed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
