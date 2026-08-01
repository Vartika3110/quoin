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
 * `env.ts` refuses to boot production without MSG91 credentials precisely
 * so this can never be the active sender in a deployed environment.
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

export function getOtpSender(): OtpSender {
  if (env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID) {
    return new Msg91OtpSender(
      env.MSG91_AUTH_KEY,
      env.MSG91_TEMPLATE_ID,
      env.MSG91_SENDER_ID,
    );
  }
  return new ConsoleOtpSender();
}
