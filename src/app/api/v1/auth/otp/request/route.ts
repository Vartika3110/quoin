import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { InvalidPhoneError, maskPhone, normalizePhone } from "@/lib/auth/phone";
import {
  isPhoneSignInAvailable,
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
  /* Checked before anything else: an unconfigured deploy would
     otherwise leave the customer staring at a code box waiting for a
     message nothing ever tried to send.

     `isPhoneSignInAvailable` and not `isSupabaseAuthConfigured`, because
     generating the code and delivering it are now two different
     integrations. Supabase can be configured while WhatsApp is not, and
     in that state Supabase accepts the request, calls the Send SMS Hook,
     and the hook refuses for want of a template — a round trip that
     spends one of the customer's rate-limited attempts to arrive at the
     answer this line already has. It is also the same function the
     sign-in and checkout screens use to decide whether to offer phone
     sign-in at all, so what the UI hides is exactly what this refuses. */
  if (!isPhoneSignInAvailable()) {
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

    /* Supabase's `code` is the stable identifier; `status` is coarser and
       several unrelated faults share one. Matched on code first, falling
       back to status, so a provider outage and a rate limit do not end up
       wearing the same sentence. */
    switch (error.code) {
      /* The provider accepted nothing — no credit, bad credentials, a
         carrier rejection, or (in India) a template not cleared for the
         sender. Nothing the customer can fix by retrying harder, so the
         copy points at the door that does work. */
      case "sms_send_failed":
        throw new ApiError(
          "internal",
          "We could not send the code just now. Please try again in a moment, or continue with Google.",
        );

      /* Per-number and per-project send limits. Distinguished from a
         generic 429 because the wait is minutes, not seconds. */
      case "over_sms_send_rate_limit":
        throw new ApiError(
          "rate_limited",
          "Too many codes sent to this number. Please wait a few minutes before trying again.",
        );

      /* Phone sign-ups switched off in the dashboard, or no SMS provider
         configured at all. A configuration fault on our side — the
         customer cannot retry their way out of it. */
      case "otp_disabled":
      case "phone_provider_disabled":
        throw new ApiError(
          "conflict",
          "Sign-in by SMS is not available yet. Please continue with Google.",
        );

      /* Supabase rejected the number itself. Rare — `normalizePhone` has
         already proved it is a well-formed Indian mobile — so this means
         Supabase and this app disagree, and the customer should be told
         about the field rather than about the system. */
      case "validation_failed":
        throw new ApiError(
          "bad_request",
          "That mobile number was not accepted. Please check it and try again.",
          { phone: "Check this number" },
        );
    }

    if (error.status === 429) {
      throw new ApiError(
        "rate_limited",
        "Too many codes requested. Please wait a minute and try again.",
      );
    }

    if (error.status === 422) {
      throw new ApiError(
        "conflict",
        "Sign-in by SMS is not available yet. Please continue with Google.",
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
