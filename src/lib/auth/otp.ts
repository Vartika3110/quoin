import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * One-time passcodes.
 *
 * Threat model: the code space is only 10^6, so no hash function makes a
 * stolen `codeHash` table meaningfully hard to reverse. The real defences
 * are the short TTL, the per-challenge attempt cap and the per-phone
 * request rate limit — all enforced in the route. HMAC with a server-side
 * secret is used so that a database leak alone (without AUTH_SECRET) is
 * not enough to derive codes, and comparison is constant-time.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;

/** A challenge is dead after this many wrong guesses. */
export const OTP_MAX_ATTEMPTS = 5;

/** Sliding window used to rate limit code requests per phone. */
export const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;

/** Minimum gap between two code requests for the same phone. */
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

/**
 * `randomInt` is cryptographically secure and, unlike `Math.random`,
 * unbiased across the range. Codes may have leading zeros, so the value
 * is padded rather than range-shifted.
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/**
 * The phone is bound into the HMAC so a code minted for one number cannot
 * be replayed against another, even if both challenges are live.
 */
export function hashCode(phone: string, code: string): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`${phone}:${code}`)
    .digest("hex");
}

/** Constant-time compare — a fast `===` leaks the code through timing. */
export function verifyCode(
  phone: string,
  code: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashCode(phone, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function otpExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + OTP_TTL_MS);
}
