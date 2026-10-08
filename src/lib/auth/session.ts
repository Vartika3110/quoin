import { cache } from "react";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import {
  isSupabaseAuthConfigured,
  supabaseReadClient,
  supabaseRouteClient,
} from "@/lib/auth/supabase";

/**
 * Sessions.
 *
 * **Supabase Auth owns the session.** It mints the OTP, verifies it, and
 * issues the access/refresh pair that `@supabase/ssr` keeps in cookies
 * and the middleware renews. This module's job is to answer one question
 * for the hundred-odd call sites that ask it — *which Quoin customer is
 * this?* — and to keep answering it in the same shape it always has, so
 * that moving to Supabase Auth did not mean editing a hundred files.
 *
 * The identity is therefore two-legged:
 *
 *   Supabase session cookie → verified `auth.users.id` → `User.id`
 *
 * The first arrow is cryptography (`getClaims`, below). The second is a
 * row lookup on `supabaseUserId`, memoised per request.
 *
 * **The legacy JWT is still read, and that is deliberate.** Everything
 * below `readSession` is the session format this app used before
 * Supabase Auth: a self-signed JWT in `quoin_session`. It is still
 * accepted because
 *
 *   1. Google sign-in still mints one — that flow has not moved to
 *      Supabase yet, and breaking it to land this would have traded a
 *      working login for a new one; and
 *   2. every customer signed in at the moment of deploy holds one, and
 *      dropping support would have logged all of them out mid-checkout.
 *
 * Nothing *creates* a legacy session except the Google callback. When
 * that moves to Supabase's Google provider, `signSession` and its cookie
 * can be deleted outright and this file halves.
 */

export const SESSION_COOKIE = "quoin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const secret = new TextEncoder().encode(env.AUTH_SECRET);
const ISSUER = "quoin";
const AUDIENCE = "quoin-storefront";

export interface SessionClaims {
  userId: string;
}

/* ------------------------------------------------------------------ */
/* Supabase sessions — the current scheme                              */
/* ------------------------------------------------------------------ */

/**
 * The verified Supabase account id on this request, or null.
 *
 * `getClaims()` rather than `getSession()`: the session cookie is not
 * httpOnly (the browser SDK has to read it), so its contents are
 * attacker-controlled until a signature says otherwise. `getClaims`
 * verifies the JWT — against a cached JWKS for projects on asymmetric
 * keys, and against the Auth server for projects still on a shared
 * secret — which `getSession` explicitly does not do. Using `getSession`
 * here would mean anyone could sign in as anyone by editing a cookie.
 *
 * Memoised with React's `cache` so a page whose tree asks for the
 * customer in nine places verifies once.
 */
const supabaseSubject = cache(async (): Promise<string | null> => {
  if (!isSupabaseAuthConfigured()) return null;

  /* A quick pre-check so a signed-out visitor — most of the traffic on a
     storefront — costs nothing at all. `@supabase/ssr` names its cookies
     after the project ref and may chunk them, so this asks by prefix. */
  const jar = await cookies();
  const hasSupabaseCookie = jar
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSupabaseCookie) return null;

  try {
    const supabase = await supabaseReadClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub;
  } catch {
    /* Network trouble reaching the Auth server, or a malformed cookie.
       Signed out is the only safe reading of "cannot verify". */
    return null;
  }
});

/**
 * Maps a verified Supabase account to the customer row.
 *
 * Memoised per request for the same reason as above — `requireUser`,
 * `viewerId` and a page's own `getSession` would otherwise each spend a
 * query establishing the same id.
 *
 * Returns null when no row is linked yet. That is not an error: it is a
 * Supabase account that has verified but never completed sign-in — the
 * verify route creates the link, so anything reading a session before
 * that happened should see a signed-out visitor rather than a crash.
 */
const customerIdFor = cache(async (supabaseUserId: string) => {
  const row = await db.user.findUnique({
    where: { supabaseUserId },
    select: { id: true },
  });
  return row?.id ?? null;
});

/* ------------------------------------------------------------------ */
/* Legacy self-signed sessions — read-only, pending the Google move     */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */

/**
 * Who is signed in.
 *
 * The one function the rest of the app calls, and its shape is unchanged
 * from before Supabase Auth on purpose — `requireUser`, `viewerId` and
 * every server component that reads a session kept working across the
 * migration because this contract did not move.
 *
 * Supabase first, legacy second. A customer who signs in with a code now
 * holds both for a while (the old cookie outlives the switch), and the
 * Supabase one is the newer, verifiable truth.
 */
export async function getSession(): Promise<SessionClaims | null> {
  const subject = await supabaseSubject();
  if (subject) {
    const userId = await customerIdFor(subject);
    if (userId) return { userId };
  }

  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Ends the session — both halves of it.
 *
 * Supabase's `signOut` revokes the refresh token server-side and clears
 * its cookies; the legacy cookie is deleted alongside. Doing only one
 * would leave the other standing, and `getSession` would happily keep
 * answering with it: a sign-out that does not sign out.
 *
 * Route handlers only — it writes cookies.
 */
export async function endSession(): Promise<void> {
  if (isSupabaseAuthConfigured()) {
    try {
      const supabase = await supabaseRouteClient();
      await supabase.auth.signOut();
    } catch (error) {
      /* A failure to reach the Auth server must not leave the customer
         looking signed in. The local cookies still get cleared below,
         and the refresh token expires on its own. */
      console.error("[auth] supabase sign-out failed", error);
    }
  }
  await clearSessionCookie();
}
