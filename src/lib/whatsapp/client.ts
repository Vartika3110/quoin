import { env } from "@/lib/env";
import { maskPhone } from "@/lib/auth/phone";
import {
  TEMPLATE_NAME,
  bodyParameters,
  buttonUrlSuffix,
  renderBody,
  type WhatsAppMessage,
} from "@/lib/whatsapp/templates";

/**
 * WhatsApp delivery.
 *
 * Behind an interface for the reason `OtpSender` is (`src/lib/auth/sender.ts`):
 * nothing that decides *what* to say should know *who* carries it, and
 * swapping the official Cloud API for another approved Business Solution
 * Provider should be this one file.
 *
 * **The official API, and nothing else.** This talks to
 * `graph.facebook.com`, Meta's own WhatsApp Business Cloud API. There is
 * no browser automation here, no Puppeteer, no QR-code session, no
 * unofficial gateway and no personal WhatsApp account — all of which are
 * against WhatsApp's terms, get the number banned, and cannot be operated
 * from a serverless function in any case.
 *
 * **Credentials never leave the server.** `WHATSAPP_ACCESS_TOKEN` is a
 * permanent system-user token with permission to send as the business
 * number; treat it exactly like `RAZORPAY_KEY_SECRET`. Nothing in
 * `src/components` imports this module, no route echoes a token, and the
 * failure messages below carry a status code and a masked number rather
 * than the request that produced them.
 */

export interface WhatsAppSendResult {
  /** The provider's `wamid....`, which the status webhook matches on. */
  providerMessageId: string | null;
}

export interface WhatsAppSender {
  send(toE164: string, message: WhatsAppMessage): Promise<WhatsAppSendResult>;
}

/**
 * Thrown for anything the provider refused. Carries no credential and no
 * request body — `sendOrderMessage` writes `message` into
 * `WhatsAppNotification.errorMessage`, which staff can read.
 */
export class WhatsAppSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

/** ---- Development ------------------------------------------------------- */

/**
 * Writes the rendered message to the server log instead of sending it.
 *
 * Unlike `ConsoleOtpSender`, which `getOtpSender` refuses to return in
 * production because a logged login code is account takeover, this one is
 * merely useless there — so the guard is different in kind:
 * `isWhatsAppConfigured()` is false without credentials, and every caller
 * checks that *before* sending and records an honest FAILED notification
 * saying WhatsApp is not configured. The console sender is therefore
 * never reached on an unconfigured deploy; it exists so the whole
 * lifecycle can be driven end to end on a laptop with no Meta account.
 */
class ConsoleWhatsAppSender implements WhatsAppSender {
  async send(toE164: string, message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    console.info(
      `[whatsapp] ${maskPhone(toE164)} ← ${TEMPLATE_NAME[message.type]} (console sender)\n${renderBody(message)}`,
    );
    /* A recognisable fake. Prefixed `console:` so nothing mistakes it for
       a real `wamid.` and goes looking for it in the Meta dashboard. */
    return { providerMessageId: `console:${message.type}:${Date.now()}` };
  }
}

/** ---- The Cloud API ----------------------------------------------------- */

/** Meta's own error envelope, as much of it as is worth reading. */
interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

interface GraphSendResponse {
  messages?: { id?: string }[];
}

const DEFAULT_API_VERSION = "v21.0";

/**
 * How long a send may hang before it is abandoned.
 *
 * Ten seconds, matching `Msg91OtpSender`. Every caller of this is already
 * downstream of a committed database write, so a timeout costs a
 * retryable FAILED notification and nothing else — but without one a hung
 * Graph call holds a serverless invocation open until the platform kills
 * it, and on the webhook path that turns into a 500 and hours of Razorpay
 * retries for an order that is in fact perfectly fine.
 */
const SEND_TIMEOUT_MS = 10_000;

/** Provider error bodies can be long; the column is for staff to read. */
const MAX_ERROR_CHARS = 400;

class CloudApiSender implements WhatsAppSender {
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly apiVersion: string,
    private readonly languageCode: string,
    /** `template` in production. `text` only before approval lands. */
    private readonly mode: "template" | "text",
  ) {}

  async send(toE164: string, message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    /* Meta wants the number in international format with no `+` and no
       separators. `normalizePhone` has already guaranteed E.164. */
    const to = toE164.replace(/^\+/, "");

    const body = this.mode === "text" ? this.textPayload(to, message) : this.templatePayload(to, message);

    let res: Response;
    try {
      res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        },
      );
    } catch (error) {
      /* A timeout or a DNS failure. Deliberately not re-thrown as the
         original error: that object can carry the request, and the
         request carries the bearer token. */
      throw new WhatsAppSendError(
        `WhatsApp request to ${maskPhone(toE164)} did not complete (${
          error instanceof Error ? error.name : "unknown error"
        })`,
      );
    }

    if (!res.ok) {
      /* Meta's message is the only genuinely useful part — "Template name
         does not exist in the translation", "Recipient phone number not
         in allowed list" — and it is what staff need to see on the order
         page. Read defensively: an error page from a proxy is not JSON. */
      let detail = "";
      try {
        const parsed = (await res.json()) as GraphError;
        detail = parsed.error?.message ?? "";
      } catch {
        detail = "";
      }
      throw new WhatsAppSendError(
        `WhatsApp rejected the message for ${maskPhone(toE164)} (${res.status}${
          detail ? `: ${detail.slice(0, MAX_ERROR_CHARS)}` : ""
        })`,
      );
    }

    const parsed = (await res.json()) as GraphSendResponse;
    /* Accepted but with no id is not an error — the message is away — so
       this returns null rather than throwing. The notification row is
       still SENT; only the delivery-status webhook has nothing to match. */
    return { providerMessageId: parsed.messages?.[0]?.id ?? null };
  }

  private templatePayload(to: string, message: WhatsAppMessage) {
    const buttonSuffix = buttonUrlSuffix(message);

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: TEMPLATE_NAME[message.type],
        language: { code: this.languageCode },
        components: [
          {
            type: "body",
            parameters: bodyParameters(message).map((text) => ({ type: "text", text })),
          },
          /* Only the vendor template has a button, and its one dynamic
             part is the path that identifies the fulfilment. `index` is
             a string in this API, not a number. */
          ...(buttonSuffix
            ? [
                {
                  type: "button",
                  sub_type: "url",
                  index: "0",
                  parameters: [{ type: "text", text: buttonSuffix }],
                },
              ]
            : []),
        ],
      },
    };
  }

  /**
   * The pre-approval escape hatch.
   *
   * A free-form text message, which WhatsApp will only deliver inside a
   * 24-hour window opened by the recipient messaging the business first.
   * That makes it useless for real customers and exactly right for the
   * days between wiring this up and six templates clearing review: the
   * operator messages their own business number, then drives the whole
   * lifecycle against it. `docs/whatsapp-orders.md` says so plainly, and
   * the variable defaults to `template` so nobody reaches this by
   * accident.
   */
  private textPayload(to: string, message: WhatsAppMessage) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: renderBody(message) },
    };
  }
}

/** ---- Configuration ----------------------------------------------------- */

/**
 * Whether a message can actually reach a handset.
 *
 * Both halves are needed and neither has a default: the phone number id
 * selects which business number sends, and the token authorises sending
 * as it. One function, asked by `sendOrderMessage` before it calls the
 * provider and by `getWhatsAppSender` before it returns one, so the two
 * cannot drift apart and disagree about whether WhatsApp works.
 */
export function isWhatsAppConfigured(): boolean {
  return Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);
}

/**
 * True when a send will do something observable — either a real provider
 * or, in development, the console sender.
 *
 * This is what the admin page asks to decide whether to explain that
 * WhatsApp is switched off, and what the notification layer asks before
 * writing a PENDING row it cannot progress.
 */
export function isWhatsAppAvailable(): boolean {
  return isWhatsAppConfigured() || env.NODE_ENV !== "production";
}

export function getWhatsAppSender(): WhatsAppSender {
  if (isWhatsAppConfigured()) {
    return new CloudApiSender(
      env.WHATSAPP_PHONE_NUMBER_ID!,
      env.WHATSAPP_ACCESS_TOKEN!,
      env.WHATSAPP_API_VERSION?.trim() || DEFAULT_API_VERSION,
      env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en",
      env.WHATSAPP_MESSAGE_MODE === "text" ? "text" : "template",
    );
  }

  /* Unconfigured in production is not reached: `sendOrderMessage` checks
     `isWhatsAppConfigured()` and records a FAILED notification instead of
     calling this. Throwing rather than silently returning the console
     sender keeps that true if a future caller forgets the check — a
     deploy that thinks it is messaging customers and is in fact writing
     to a log is the failure worth being loud about. */
  if (env.NODE_ENV === "production") {
    throw new WhatsAppSendError(
      "WhatsApp is not configured: set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN",
    );
  }

  return new ConsoleWhatsAppSender();
}
