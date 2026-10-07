import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { InvalidPhoneError, maskPhone, normalizePhone } from "@/lib/auth/phone";
import {
  isSupabaseAuthConfigured,
  supabaseRouteClient,
} from "@/lib/auth/supabase";
import { OTP_RESEND_COOLDOWN_MS } from "@/lib/auth/otp";

const Body = z.object({
  phone: z.string().min(1, "Enter your mobile number"),
});

/**
 * POST /api/v1/auth/otp/request
 *
 * Asks Supabase Auth to send a login code.
 *
 * Sign-up and sign-in are the same call — `shouldCreateUser` is left at
 * its default, so Supabase creates the account on first verification —
 * and the response deliberately reveals nothing about whether the number
 * is already registered.
 *
 * **Nothing about the code is this app's business any more.** Generation,
 * hashing, expiry, the attempt cap and the replay check all moved into
 * Supabase when it became the auth provider; `otp_challenges` is no
 * longer written. What is left here is the part Supabase cannot do:
 * deciding that "9876543210" and "+91 98765 43210" are one customer, and
 * refusing a number that could never receive an SMS before one is paid
 * for.
 */
export const POST = handler(async (request) => {
  /* Checked before anything else, exactly as the MSG91 version was: an
     unconfigured deploy would otherwise leave the customer staring at a
     code box waiting for an SMS nothing ever tried to send. */
  if (!isSupabaseAuthConfigured()) {
    throw new ApiError(
      "conflict",
      "Sign-in by SMS is not available yet. Please try again later.",
    );
  }

  const body = await parseBody(request, Body);

  let phone: string;
  try {
    phone = normalizePhone(body.phone);
  } catch (error) {
    if (error instanceof InvalidPhoneError) {
      throw new ApiError("bad_request", error.message, { phone: error.message });
    }
    throw error;
  }

  const supabase = await supabaseRouteClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    /* Supabase's own message is not shown. It is written for a developer
       reading a console — it names rate-limit windows, provider errors
       and occasionally the SMS gateway's raw response — and none of that
       belongs in front of a customer. Mapped to the three things a
       customer can actually do about it instead. */
    console.error(
      `[auth] supabase signInWithOtp failed for ${maskPhone(phone)}`,
      { status: error.status, code: error.code, message: error.message },
    );

    if (error.status === 429) {
      throw new ApiError(
        "rate_limited",
        "Too many codes requested. Please wait a minute and try again.",
      );
    }

    /* 422 is Supabase's answer when phone sign-ups are switched off in
       the dashboard, or no SMS provider is wired up. Both are a
       configuration problem on our side, not something the customer can
       retry their way out of. */
    if (error.status === 422) {
      throw new ApiError(
        "conflict",
        "Sign-in by SMS is not available yet. Please try again later.",
      );
    }

    throw new ApiError(
      "internal",
      "We could not send the code right now. Please try again.",
    );
  }

  return ok({
    sent: true,
    phone: maskPhone(phone),
    /* The client counts this down to decide when "Resend" lights up.
       Supabase enforces its own window server-side and answers 429 past
       it; this is the hint, not the rule. */
    resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
  });
});
