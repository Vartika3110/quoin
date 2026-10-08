import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { InvalidPhoneError, maskPhone, normalizePhone } from "@/lib/auth/phone";
import {
  isSupabaseAuthConfigured,
  supabaseRouteClient,
} from "@/lib/auth/supabase";
import {
  resolveSupabaseUser,
  SupabaseIdentityError,
} from "@/lib/auth/supabase-user";
import { OTP_LENGTH } from "@/lib/auth/otp";

const Body = z.object({
  phone: z.string().min(1, "Enter your mobile number"),
  code: z
    .string()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`),
});

/**
 * POST /api/v1/auth/otp/verify
 *
 * Hands the code to Supabase Auth and, if it is good, turns the account
 * Supabase vouches for into a Quoin customer.
 *
 * Two identities meet here and it is worth being precise about which
 * does what. **Supabase decides whether the phone is real** — it checked
 * the code, it rejected the expired one, it counted the attempts, and on
 * success `verifyOtp` writes a session into the cookie jar. **This app
 * decides which customer that is**, because `User.id` is what twenty
 * relations hang off and no amount of auth migration changes that.
 *
 * The phone in the request body is used for one thing only: telling
 * Supabase which challenge to check the code against. The number that
 * reaches the database comes back off the verified Supabase user — see
 * `resolveSupabaseUser`. A phone a browser typed is never identity.
 */
export const POST = handler(async (request) => {
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
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: body.code,
    type: "sms",
  });

  if (error || !data.user) {
    console.error(`[auth] supabase verifyOtp failed for ${maskPhone(phone)}`, {
      status: error?.status,
      code: error?.code,
      message: error?.message,
    });

    if (error?.status === 429) {
      throw new ApiError(
        "rate_limited",
        "Too many incorrect attempts. Request a new code.",
      );
    }

    /**
     * Expiry is called out separately, and this is a deliberate reversal.
     *
     * The hand-rolled version answered "incorrect or has expired" to
     * everything, on the reasoning that telling them apart reveals which
     * numbers have live challenges. That reasoning is sound but the
     * leak is worth almost nothing — anyone can request a code for a
     * number and learn the same thing — while the cost is paid by every
     * real customer who comes back to a stale tab and retypes a correct
     * code three times because nothing told them it had simply gone off.
     *
     * "Incorrect" and "never existed" stay merged below. Only expiry,
     * which has a clear and different remedy, is named.
     */
    if (error?.code === "otp_expired") {
      throw new ApiError(
        "bad_request",
        "That code has expired. Send yourself a new one.",
        { code: "Expired — request a new code" },
      );
    }

    /* One message whether the code was wrong or no challenge existed. */
    throw new ApiError("bad_request", "That code is incorrect or has expired.", {
      code: "Incorrect or expired code",
    });
  }

  let resolved: { userId: string; isNewUser: boolean };
  try {
    resolved = await resolveSupabaseUser(data.user);
  } catch (identityError) {
    if (identityError instanceof SupabaseIdentityError) {
      /* The customer is genuinely verified but cannot be seated at an
         account — a recycled number, or two Supabase accounts for one
         line. Signing them out again is the honest end: leaving the
         Supabase session standing would mean a browser that is logged in
         to nothing, and every later request silently anonymous. */
      await supabase.auth.signOut();
      throw new ApiError("conflict", identityError.message);
    }
    throw identityError;
  }

  /* Read after linking rather than returned from the resolver: this is
     the shape the sign-in panel and the checkout step already consume,
     and the tier and wallet on it have to come from the row, never from
     a token body. */
  const user = await db.user.findUniqueOrThrow({
    where: { id: resolved.userId },
    select: { id: true, phone: true, name: true, tier: true, walletPaise: true },
  });

  /* No `setSessionCookie` here any more. `verifyOtp` already wrote the
     Supabase session through the cookie adapter in `supabaseRouteClient`,
     and `getSession` reads it. Minting a second, self-signed cookie
     beside it would create two sources of truth that could disagree
     after a sign-out. */

  /* The client uses this to decide between sending a new customer to the
     address form and returning a known one to where they left off. */
  return ok({ user, isNewUser: resolved.isNewUser });
});
