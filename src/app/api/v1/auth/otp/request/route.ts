import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { InvalidPhoneError, maskPhone, normalizePhone } from "@/lib/auth/phone";
import { getOtpSender, isOtpDeliveryAvailable } from "@/lib/auth/sender";
import {
  generateCode,
  hashCode,
  otpExpiry,
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_MS,
  OTP_RESEND_COOLDOWN_MS,
} from "@/lib/auth/otp";

const Body = z.object({
  phone: z.string().min(1, "Enter your mobile number"),
});

/**
 * POST /api/v1/auth/otp/request
 *
 * Sends a login code. Sign-up and sign-in are the same call — the account
 * is created on successful verification, so the response deliberately
 * reveals nothing about whether the number is already registered.
 */
export const POST = handler(async (request) => {
  /* Checked before anything is written, not after. An unconfigured deploy
     would otherwise mint a challenge and a code for every customer who
     reached this screen, none of which could ever be delivered — and the
     customer would be left staring at a box waiting for an SMS that was
     never sent. Same shape as the Razorpay check in `/checkout/order`. */
  if (!isOtpDeliveryAvailable()) {
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

  const now = new Date();
  const windowStart = new Date(now.getTime() - OTP_REQUEST_WINDOW_MS);

  /* Rate limiting is keyed on the phone, not the IP: the cost being
     controlled is outbound SMS spend and harassment of the number's real
     owner, and both survive an IP change. */
  const recent = await db.otpChallenge.findMany({
    where: { phone, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recent.length >= OTP_MAX_REQUESTS_PER_WINDOW) {
    const oldest = recent[recent.length - 1].createdAt;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (oldest.getTime() + OTP_REQUEST_WINDOW_MS - now.getTime()) / 1000,
      ),
    );
    throw new ApiError(
      "rate_limited",
      `Too many codes requested. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
    );
  }

  if (recent.length > 0) {
    const sinceLast = now.getTime() - recent[0].createdAt.getTime();
    if (sinceLast < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLast) / 1000);
      throw new ApiError(
        "rate_limited",
        `Please wait ${wait} seconds before requesting another code.`,
      );
    }
  }

  const code = generateCode();
  const expiresAt = otpExpiry(now);

  await db.otpChallenge.create({
    data: { phone, codeHash: hashCode(phone, code), expiresAt },
  });

  /* Delivery failure must not leave a challenge the customer cannot use,
     but the row is kept for rate-limit history — a retry loop against a
     broken gateway should still be throttled. */
  try {
    await getOtpSender().send(phone, code);
  } catch (error) {
    console.error(`[otp] delivery failed for ${maskPhone(phone)}`, error);
    throw new ApiError(
      "internal",
      "We could not send the code right now. Please try again.",
    );
  }

  return ok({
    sent: true,
    phone: maskPhone(phone),
    expiresAt: expiresAt.toISOString(),
    resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
  });
});
