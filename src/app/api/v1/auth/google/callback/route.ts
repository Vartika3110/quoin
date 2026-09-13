import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/auth/next";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import {
  GOOGLE_OAUTH_COOKIE_PATH,
  GOOGLE_OAUTH_STATE_COOKIE,
  googleRedirectUri,
  resolveGoogleUser,
  verifyGoogleIdToken,
  verifyGoogleOAuthState,
} from "@/lib/auth/google";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/auth/google/callback
 *
 * Where Google's own redirect lands. Like `start`, this is browser
 * navigation and answers with a redirect, never the `/api/v1` JSON
 * envelope — the caller here is a browser tab, not a script that could
 * read a body.
 *
 * The state cookie is deleted on every path out of this function — the
 * `finally` below runs whether a branch returns, or Google, our own fetch,
 * or `resolveGoogleUser` throws. A stale state cookie is a replay
 * opportunity for the ten minutes it would otherwise still be valid.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const jar = await cookies();

  try {
    const savedState = await verifyGoogleOAuthState(
      jar.get(GOOGLE_OAUTH_STATE_COOKIE)?.value,
    );

    /* No trustworthy `next` exists yet — it lives inside the cookie we
       just failed to verify — so this one error redirect falls back to
       the account page rather than honouring `?next=` from the query
       string, which nothing signed here. */
    if (!savedState) {
      return NextResponse.redirect(
        new URL("/signin?error=google_failed", requestUrl.origin),
      );
    }

    const next = safeNext(savedState.next);
    const fail = (error: string) =>
      NextResponse.redirect(
        new URL(`/signin?error=${error}&next=${encodeURIComponent(next)}`, requestUrl.origin),
      );

    const stateParam = requestUrl.searchParams.get("state") ?? "";
    if (!constantTimeEqual(stateParam, savedState.state)) {
      return fail("google_failed");
    }

    /* Google sets `error` (commonly `access_denied`) instead of `code`
       when the customer declines consent or backs out — not a failure of
       this integration, so it gets its own, gentler copy. */
    if (requestUrl.searchParams.get("error")) {
      return fail("google_cancelled");
    }

    const code = requestUrl.searchParams.get("code");
    if (!code) {
      return fail("google_failed");
    }

    let idToken: string;
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID ?? "",
          client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri: googleRedirectUri(request),
          grant_type: "authorization_code",
          code_verifier: savedState.verifier,
        }),
        /* Same timeout as `sender.ts`'s MSG91 call: without one a hung
           gateway holds this request open until the platform kills it. */
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenRes.ok) {
        throw new Error(`Google's token endpoint answered ${tokenRes.status}`);
      }
      const body = (await tokenRes.json()) as { id_token?: string };
      if (!body.id_token) throw new Error("token response carried no id_token");
      idToken = body.id_token;
    } catch (error) {
      console.error("[auth/google] token exchange failed:", reasonOf(error));
      return fail("google_failed");
    }

    try {
      const identity = await verifyGoogleIdToken(idToken, {
        clientId: env.GOOGLE_CLIENT_ID ?? "",
        nonce: savedState.nonce,
      });
      const { userId } = await resolveGoogleUser(identity);
      await setSessionCookie(await signSession(userId));
    } catch (error) {
      console.error("[auth/google] sign-in failed:", reasonOf(error));
      return fail("google_failed");
    }

    return NextResponse.redirect(new URL(next, requestUrl.origin));
  } finally {
    jar.delete({ name: GOOGLE_OAUTH_STATE_COOKIE, path: GOOGLE_OAUTH_COOKIE_PATH });
  }
}

/** Equal-length check first: `timingSafeEqual` throws on mismatched
    lengths rather than answering false, and the length itself must not
    leak through how quickly that throw happens. */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Never the token, the code, or the email — only ever a message this
    file wrote itself, or an upstream error's class name. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
