import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/auth/next";
import {
  GOOGLE_OAUTH_COOKIE_PATH,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_TTL_SECONDS,
  codeChallengeS256,
  createCodeVerifier,
  googleRedirectUri,
  isGoogleSignInConfigured,
  randomToken,
  signGoogleOAuthState,
} from "@/lib/auth/google";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/auth/google/start
 *
 * Sends the whole tab to Google's consent screen. A browser-navigation
 * route, not an `/api/v1` data call, so it answers with a redirect rather
 * than the JSON `handler`/`ok`/`ApiError` envelope in `src/lib/http.ts` —
 * there is no script on the other end to read a body, only the browser
 * following a `Location` header.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = safeNext(requestUrl.searchParams.get("next") ?? undefined);

  if (!isGoogleSignInConfigured()) {
    return NextResponse.redirect(
      new URL(`/signin?error=google_unavailable&next=${encodeURIComponent(next)}`, requestUrl.origin),
    );
  }

  const state = randomToken(32);
  const nonce = randomToken(32);
  const verifier = createCodeVerifier();

  const stateToken = await signGoogleOAuthState({ state, nonce, verifier, next });

  const jar = await cookies();
  jar.set(GOOGLE_OAUTH_STATE_COOKIE, stateToken, {
    httpOnly: true,
    /* Lax, not Strict: this cookie must still be sent on the top-level
       GET that lands back on `/api/v1/auth/google/callback` after Google
       redirects the browser there — a cross-site navigation, which
       `SameSite=Strict` would drop the cookie on. */
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: GOOGLE_OAUTH_COOKIE_PATH,
    maxAge: GOOGLE_OAUTH_STATE_TTL_SECONDS,
  });

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  authorizeUrl.searchParams.set("redirect_uri", googleRedirectUri(request));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", nonce);
  authorizeUrl.searchParams.set("code_challenge", codeChallengeS256(verifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  /* Always shows the account chooser rather than silently reusing
     whichever Google account last authorised this browser — a shared
     library or shop computer must not sign someone in as the previous
     customer without a click confirming which account this is. */
  authorizeUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authorizeUrl);
}
