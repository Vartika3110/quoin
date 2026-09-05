import { env } from "@/lib/env";
import { maskPhone } from "@/lib/auth/phone";

/**
 * OTP delivery.
 *
 * Behind an interface so the route never knows which provider is in play,
 * and so switching from MSG91 to another gateway is one file. MSG91 is the
 * default because it is materially cheaper than Twilio for Indian traffic
 * and supports the DLT template registration that TRAI requires.
 */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

/**
 * Development only. Writes the code to the server log so local sign-in
 * works without spending money or registering a DLT template.
 *
 * `getOtpSender()` refuses to hand this back in production, so it cannot
 * become the active sender on a deployed instance. That guard used to live
 * in `env.ts` as a refusal to boot at all — see the note there on why it
 * moved, and on the configuration that slipped past it.
 */
class ConsoleOtpSender implements OtpSender {
  async send(phone: string, code: string): Promise<void> {
    console.info(`[otp] ${maskPhone(phone)} → ${code} (console sender)`);
  }
}

class Msg91OtpSender implements OtpSender {
  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
    private readonly senderId?: string,
  ) {}

  async send(phone: string, code: string): Promise<void> {
    /* MSG91 wants the number without the leading `+`. */
    const mobile = phone.replace(/^\+/, "");

    const res = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: this.authKey,
      },
      body: JSON.stringify({
        template_id: this.templateId,
        mobile,
        otp: code,
        ...(this.senderId ? { sender: this.senderId } : {}),
      }),
      /* Without a timeout a hung gateway holds the request open until the
         platform kills it, and the customer sees a spinner, not an error. */
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      /* Deliberately does not include the code or the full number. */
      throw new Error(
        `MSG91 rejected the request for ${maskPhone(phone)} (${res.status})`,
      );
    }
  }
}

/**
 * Whether a code can actually reach a customer's handset.
 *
 * Both halves are needed: MSG91 selects the DLT-registered template by id,
 * and an auth key without one cannot send anything. This is the single
 * condition — the route asks it before writing a challenge, and
 * `getOtpSender` asks it before returning a sender, so the two cannot
 * drift apart and disagree about whether sign-in works.
 */
export function isOtpDeliveryConfigured(): boolean {
  return Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID);
}

/**
 * Whether the OTP endpoint should accept a request at all.
 *
 * True in development regardless, where the console sender is the point.
 */
export function isOtpDeliveryAvailable(): boolean {
  return isOtpDeliveryConfigured() || env.NODE_ENV !== "production";
}

export function getOtpSender(): OtpSender {
  if (isOtpDeliveryConfigured()) {
    return new Msg91OtpSender(
      env.MSG91_AUTH_KEY!,
      env.MSG91_TEMPLATE_ID!,
      env.MSG91_SENDER_ID,
    );
  }

  /* Never the console sender on a deployed instance. Printing a login code
     to a log anyone with dashboard access can read is account takeover, and
     it is the failure this whole file is arranged to make impossible. */
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to send an OTP through the console sender in production",
    );
  }

  return new ConsoleOtpSender();
}
