import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { InvalidPhoneError, normalizePhone } from "@/lib/auth/phone";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, verifyCode } from "@/lib/auth/otp";

const Body = z.object({
  phone: z.string().min(1, "Enter your mobile number"),
  code: z
    .string()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`),
});

/**
 * POST /api/v1/auth/otp/verify
 *
 * Verifies a code and starts a session, creating the account on first
 * successful verification. This is the only place a User row is created,
 * so every account in the system has a verified phone by construction.
 */
export const POST = handler(async (request) => {
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

  const challenge = await db.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });

  /* Same message whether nothing was ever sent, it expired, or it was
     already used — distinguishing them tells an attacker which numbers
     have live challenges. */
  const invalid = () =>
    new ApiError("bad_request", "That code is incorrect or has expired.", {
      code: "Incorrect or expired code",
    });

  if (!challenge) throw invalid();

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(
      "rate_limited",
      "Too many incorrect attempts. Request a new code.",
    );
  }

  /* Recorded before the comparison, so a crash or a dropped connection
     mid-verify cannot be used to farm unlimited free guesses. */
  const attempted = await db.otpChallenge.update({
    where: { id: challenge.id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true, codeHash: true },
  });

  if (!verifyCode(phone, body.code, attempted.codeHash)) {
    throw invalid();
  }

  /* Consume conditionally: `consumedAt: null` in the filter means two
     concurrent requests with the same valid code cannot both succeed. */
  const consumed = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) throw invalid();

  const existing = await db.user.findUnique({
    where: { phone },
    select: { id: true },
  });

  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: {},
        select: { id: true, phone: true, name: true, tier: true, walletPaise: true },
      })
    : await db.user.create({
        data: { phone },
        select: { id: true, phone: true, name: true, tier: true, walletPaise: true },
      });

  await setSessionCookie(await signSession(user.id));

  /* The client uses this to decide between sending a new customer to the
     address form and returning a known one to where they left off. */
  return ok({ user, isNewUser: !existing });
});
