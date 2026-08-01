import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

/**
 * Sessions.
 *
 * A signed JWT in an httpOnly cookie. Chosen over a database session table
 * because every request on the storefront needs the user id and tier, and
 * a stateless token keeps that off the hot path.
 *
 * The tradeoff is real and worth stating: a JWT cannot be revoked before
 * it expires. Tier is therefore re-read from the database wherever money
 * depends on it — a customer who cancels Pro must not keep trade pricing
 * for the remaining life of their token. See `requireUser`.
 */

export const SESSION_COOKIE = "quoin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const secret = new TextEncoder().encode(env.AUTH_SECRET);
const ISSUER = "quoin";
const AUDIENCE = "quoin-storefront";

export interface SessionClaims {
  userId: string;
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

/** Returns null on any failure — expired, tampered, or wrong audience. */
export async function readSession(
  token: string | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    /* Lax rather than Strict: the session must survive a customer
       returning from the payment gateway redirect in module 5. */
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}
