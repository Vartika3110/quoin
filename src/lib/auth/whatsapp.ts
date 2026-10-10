import { env } from "@/lib/env";
import { maskPhone } from "@/lib/auth/phone";

/**
 * One-time passcodes over WhatsApp.
 *
 * **Why WhatsApp rather than SMS.** India's TRAI requires every
 * transactional SMS to go out under a DLT-registered header and
 * template, registered by the business whose brand the message carries.
 * That is a multi-day approval that needs the incorporation certificate,
 * the company PAN and the GSTIN. WhatsApp is not SMS and TCCCPR does not
 * reach it, so this path sends nothing through an Indian telecom
 * operator and needs no DLT registration at all.
 *
 * It is not approval-free — Meta verifies the business and approves the
 * message template — but that queue is usually shorter than DLT's, and
 * for contractors buying cement in West Delhi a WhatsApp is a more
 * natural thing to receive than an email.
 *
 * **What this file is and is not responsible for.** Supabase Auth
 * generates the code, stores it, checks it, expires it and counts the
 * attempts — everything that makes it an auth system. This only carries
 * the code to the handset, called from the Send SMS Hook. Nothing here
 * decides whether a code is valid.
 *
 * **Meta's Cloud API directly, not a reseller.** Gupshup, AiSensy and
 * Interakt all resell the same underlying API with a dashboard on top;
 * going direct removes a vendor, a markup and a second place for
 * credentials to live. The `WhatsAppSender` interface below is the
 * seam — if a BSP is ever wanted for its template tooling, it is one
 * implementation of this and nothing else changes. That is the same
 * arrangement `StorageProvider` uses for object storage.
 */

export interface WhatsAppSender {
  send(phone: string, code: string): Promise<void>;
}

/** Meta's Graph API version. Pinned: Meta retires these on a schedule. */
const GRAPH_VERSION = "v21.0";

/** A hung gateway must become an error, not an open request. */
const TIMEOUT_MS = 10_000;

/**
 * Whether a code can actually reach a handset.
 *
 * All three are needed and none has a safe default. The phone number id
 * identifies which registered number sends; the token authorises it; the
 * template name selects the approved message. A missing template is the
 * one that fails most confusingly — Meta accepts the request and returns
 * an error naming a template nobody registered — so it is checked here
 * rather than discovered in a log.
 */
export function isWhatsAppOtpConfigured(): boolean {
  return Boolean(
    env.WHATSAPP_PHONE_NUMBER_ID &&
      env.WHATSAPP_ACCESS_TOKEN &&
      env.WHATSAPP_OTP_TEMPLATE,
  );
}

class CloudApiSender implements WhatsAppSender {
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly template: string,
    private readonly language: string,
  ) {}

  async send(phone: string, code: string): Promise<void> {
    /* Meta wants E.164 without the leading `+`, the same shape MSG91
       wanted. `normalizePhone` has already produced a `+91…` by the time
       this is called. */
    const to = phone.replace(/^\+/, "");

    /**
     * An Authentication template, which is a specific kind with rules of
     * its own: the code goes in the body *and* again in the copy-code
     * button, and Meta rejects the message if the two disagree. The
     * button is what makes the code tappable rather than something the
     * customer has to retype from a notification — which is most of the
     * reason to prefer WhatsApp over SMS here at all.
     */
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: this.template,
        language: { code: this.language },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: code }],
          },
        ],
      },
    };

    let res: Response;
    try {
      res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new Error(
        `Could not reach WhatsApp: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }

    if (!res.ok) {
      /* Meta's error bodies quote the request back and can contain the
         template's own text. The message is read for the log and never
         returned to a caller; the code is never in either. */
      const detail = await res
        .json()
        .then((b: unknown) => (b as { error?: { message?: string } })?.error?.message)
        .catch(() => undefined);
      throw new Error(
        `WhatsApp rejected the message for ${maskPhone(phone)} (${res.status}${detail ? `: ${detail}` : ""})`,
      );
    }
  }
}

/**
 * Development only. Writes the code to the server log.
 *
 * `getWhatsAppSender()` refuses to return this in production, so it
 * cannot become the active sender on a deployed instance — the same
 * guard, for the same reason, that `src/lib/auth/sender.ts` carried for
 * MSG91: a login code in a log anyone with dashboard access can read is
 * account takeover.
 */
class ConsoleSender implements WhatsAppSender {
  async send(phone: string, code: string): Promise<void> {
    console.info(`[whatsapp] ${maskPhone(phone)} → ${code} (console sender)`);
  }
}

export function getWhatsAppSender(): WhatsAppSender {
  if (isWhatsAppOtpConfigured()) {
    return new CloudApiSender(
      env.WHATSAPP_PHONE_NUMBER_ID!,
      env.WHATSAPP_ACCESS_TOKEN!,
      env.WHATSAPP_OTP_TEMPLATE!,
      env.WHATSAPP_OTP_LANGUAGE ?? "en",
    );
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to send a WhatsApp code through the console sender in production",
    );
  }

  return new ConsoleSender();
}
