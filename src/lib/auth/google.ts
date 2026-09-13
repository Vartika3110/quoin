import { randomBytes, createHash } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Google sign-in.
 *
 * Everything Google-specific lives here — PKCE, id-token verification,
 * account resolution, and the OAuth state token — so the two route
 * handlers (`start`, `callback`) are thin: build a URL, or read one back
 * and hand off to a session. Kept as one file per the brief; if a future
 * change makes importing this drag in enough to break the pure unit
 * tests, split the pure helpers (`codeChallengeS256`, `verifyGoogleIdToken`)
 * into their own module with no `db` import — today it does not, because
 * `db.ts` only constructs a lazy Prisma client and never reaches the
 * network at import time, the same reason `tests/unit.test.mts` already
 * imports `@/lib/data/orders`, which imports `db`, with no ill effect.
 */

/**
 * Whether the Google button should render at all.
 *
 * Both variables are needed: an OAuth client id with no secret cannot
 * exchange a code, and there is no partial-credit state worth showing a
 * customer a button for. Same shape as `isOtpDeliveryConfigured` in
 * `sender.ts` — one condition, asked everywhere the answer matters, so
 * the UI and the routes cannot drift apart about whether this works.
 */
export function isGoogleSignInConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** ---- PKCE --------------------------------------------------------------
 *
 * Authorization Code + PKCE rather than the bare code flow: the code
 * exchange happens server-to-server anyway (see the callback route), so
 * PKCE is not defending against a public client here. It is defended in
 * depth for free — the code alone, if it ever leaked out of the redirect
 * (a referrer header, a proxy log), is useless without the verifier this
 * server alone holds in the signed state cookie.
 */

/** `bytes` random bytes, base64url-encoded. Used for the verifier, and for
    the CSRF `state` and OIDC `nonce` the start route mints alongside it. */
export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

/** 32 random bytes, base64url — RFC 7636 wants 43-128 characters; this is 43. */
export function createCodeVerifier(): string {
  return randomToken(32);
}

/** RFC 7636 §4.2: `BASE64URL-ENCODE(SHA256(ASCII(verifier)))`. */
export function codeChallengeS256(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** ---- Verifying Google's id_token ----------------------------------------
 *
 * Production reaches Google's own JWKS endpoint; `jwtVerify` caches the
 * keys and refetches only on a `kid` it has not seen. Injectable so tests
 * can substitute `createLocalJWKSet` over a locally generated keypair
 * without a network call — see `tests/unit.test.mts`.
 */
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export class GoogleIdTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleIdTokenError";
  }
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

/**
 * Verifies a Google `id_token` and returns the claims this app trusts.
 *
 * Four checks beyond signature/issuer/audience, each guarding something
 * a customer's browser could otherwise forge or replay:
 *
 *  - `nonce` must match the one this server minted for this attempt —
 *    without it, a token obtained for a *different* sign-in attempt
 *    (e.g. phished from another tab) could be replayed here.
 *  - `sub` must be a string — it is the only identifier this app ever
 *    matches an account on; anything else means a malformed token.
 *  - `email_verified` must be `true` — Google issues id_tokens for
 *    unverified addresses too (an address someone typed but never
 *    confirmed), and trusting one would let anyone claim an inbox they
 *    do not own.
 *  - `email` must be a string, for the same reason `sub` must be.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  options: { clientId: string; nonce: string; jwks?: JWTVerifyGetKey },
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, options.jwks ?? GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: options.clientId,
  }).catch(() => {
    throw new GoogleIdTokenError("Google's id_token failed verification");
  });

  if (payload.nonce !== options.nonce) {
    throw new GoogleIdTokenError("id_token nonce did not match this attempt");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new GoogleIdTokenError("id_token had no subject");
  }
  if (payload.email_verified !== true) {
    throw new GoogleIdTokenError("Google reports this email as unverified");
  }
  if (typeof payload.email !== "string" || !payload.email) {
    throw new GoogleIdTokenError("id_token had no email");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

/** ---- Resolving an account ------------------------------------------------ */

export interface ResolvedGoogleUser {
  userId: string;
  isNewUser: boolean;
}

/**
 * Finds or creates the account behind a verified Google identity.
 *
 * Matched on `googleSub` only, never on email. `User.email` is written
 * from exactly one place in this codebase before this feature: nowhere —
 * grep confirms no route or panel ever sets it, `SettingsPanel` is
 * read-only, and the only writer added by this change is the branch
 * below. That happens to make email-matching *safe* today, but the rule
 * is written as though it were not, on purpose: the moment some future
 * settings page lets a customer type an email with no verification step,
 * matching on it here would let that customer type someone else's inbox
 * and inherit their orders, wallet and addresses — silent account
 * takeover, discovered only when the real owner does. `googleSub` is
 * never user-entered; it is a claim Google's own signature just proved.
 *
 * Two races, both resolved by the unique indexes rather than a
 * check-then-write (invariant 7):
 *
 *  - Two concurrent callbacks for a `sub` that has never signed in
 *    before both miss the `findFirst` and both attempt `create`; the
 *    loser hits P2002 on `googleSub` and re-reads the row the winner
 *    just wrote.
 *  - A `sub` that is new here but whose Google email already belongs to
 *    a different row (a phone-verified account that happens to share an
 *    address, or a previous Google account with the same email changed
 *    upstream) hits P2002 on `email`; retried once with `email: null`
 *    rather than surfacing a 500 for a collision that is not this
 *    customer's fault.
 */
export async function resolveGoogleUser(
  identity: GoogleIdentity,
): Promise<ResolvedGoogleUser> {
  const existing = await db.user.findUnique({
    where: { googleSub: identity.sub },
    select: { id: true },
  });
  if (existing) return { userId: existing.id, isNewUser: false };

  try {
    const created = await db.user.create({
      data: { googleSub: identity.sub, email: identity.email, name: identity.name },
      select: { id: true },
    });
    return { userId: created.id, isNewUser: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const target = (error.meta?.target as string[] | undefined) ?? [];

    if (target.includes("googleSub")) {
      /* Lost the create race — the winner's row now exists. */
      const row = await db.user.findUnique({
        where: { googleSub: identity.sub },
        select: { id: true },
      });
      if (row) return { userId: row.id, isNewUser: false };
      throw error;
    }

    if (target.includes("email")) {
      const created = await db.user.create({
        data: { googleSub: identity.sub, email: null, name: identity.name },
        select: { id: true },
      });
      return { userId: created.id, isNewUser: true };
    }

    throw error;
  }
}

/** ---- OAuth state --------------------------------------------------------
 *
 * A signed, short-lived JWT carrying everything the callback needs to
 * trust the redirect it is handling: the CSRF `state`, the OIDC `nonce`
 * that must reappear inside the id_token, the PKCE `verifier`, and where
 * to send the customer afterwards. Stored in the `quoin_google_oauth`
 * cookie by the route handlers themselves (they alone touch
 * `next/headers`, so this file — and the pure functions in it — stays
 * importable from a plain Node test with no request context).
 *
 * A distinct audience from the session token (`quoin-google-oauth` vs
 * `quoin-storefront`, `src/lib/auth/session.ts`) so one can never be
 * replayed as the other — a leaked state token cannot be presented as a
 * session, and a session cannot be forged by relabelling a state token.
 */
const OAUTH_STATE_ISSUER = "quoin";
const OAUTH_STATE_AUDIENCE = "quoin-google-oauth";
export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 600;

/** Cookie name and path, shared by both routes so `start` setting it and
    `callback` deleting it can never quietly drift apart. Scoped under
    `/api/v1/auth/google` rather than site-wide `/`: this cookie is only
    ever read by the callback, one path below where it is set. */
export const GOOGLE_OAUTH_STATE_COOKIE = "quoin_google_oauth";
export const GOOGLE_OAUTH_COOKIE_PATH = "/api/v1/auth/google";

export interface GoogleOAuthState {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

export async function signGoogleOAuthState(claims: GoogleOAuthState): Promise<string> {
  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(OAUTH_STATE_ISSUER)
    .setAudience(OAUTH_STATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${GOOGLE_OAUTH_STATE_TTL_SECONDS}s`)
    .sign(secret);
}

/** Returns null on any failure — expired, tampered, or wrong audience. */
export async function verifyGoogleOAuthState(
  token: string | undefined,
): Promise<GoogleOAuthState | null> {
  if (!token) return null;
  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: OAUTH_STATE_ISSUER,
      audience: OAUTH_STATE_AUDIENCE,
    });
    const { state, nonce, verifier, next } = payload as Partial<GoogleOAuthState>;
    if (
      typeof state !== "string" ||
      typeof nonce !== "string" ||
      typeof verifier !== "string" ||
      typeof next !== "string"
    ) {
      return null;
    }
    return { state, nonce, verifier, next };
  } catch {
    return null;
  }
}

/**
 * The one place `redirect_uri` is built, used by both `start` and
 * `callback` so they can never disagree about it.
 *
 * Built from the request's own origin rather than `siteOrigin()`
 * (`src/lib/env.ts`) on purpose: the state cookie this flow depends on is
 * set on whichever host the customer is actually browsing —
 * `*.vercel.app`, a custom domain, or `localhost` — and a `redirect_uri`
 * naming a different host would send Google's redirect to a host that
 * never set the cookie the callback needs. A spoofed `Host` header gains
 * an attacker nothing here either way: Google itself rejects any
 * `redirect_uri` that is not registered in the Cloud Console for this
 * client id, spoofed or not.
 */
export function googleRedirectUri(request: Request): string {
  return new URL("/api/v1/auth/google/callback", new URL(request.url).origin).toString();
}
