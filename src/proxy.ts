import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  configuredAdminHost,
  hostVerdict,
  normalizeHost,
} from "@/lib/auth/admin-host";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { contentSecurityPolicy, cspHeaderName } from "@/lib/security/csp";

/*
 * Was `src/middleware.ts` until Next 16.4 deprecated that convention in
 * favour of `proxy`, warning on every build. Same file, same matcher,
 * same order of operations — the function is named `proxy` and the file
 * is named for it. Nothing about the host split changed, and the tests
 * that cover it (`tests/admin-host.test.mts`) were run against this.
 */

/**
 * Response headers.
 *
 * This app had none beyond the HSTS Vercel sets for itself: no CSP, no
 * `nosniff`, no referrer policy, no frame protection. A storefront that
 * takes payments and holds addresses should not be in that state, and the
 * fix is one file because there was no proxy at all.
 *
 * The split below is the whole design, and it is deliberate.
 *
 * **Enforced: the headers that cannot break a working page.** Refusing to
 * sniff a MIME type, trimming the referrer, declining to be framed and
 * switching off device APIs nothing uses are all changes whose failure
 * mode is "something that was already wrong stops working". They go on
 * now.
 *
 * **The CSP, now enforced.** It spent a month report-only because a
 * content policy is the one header here that can take a checkout down,
 * and the condition for enforcing was "watch a real test payment and a
 * real Studio clip through it first". Neither was reachable — there are
 * no Studio clips in the database at all, and the test payment is
 * behind PAY-01 — so the question was settled by reading what Razorpay's
 * checkout script actually asks for instead. The policy and that
 * evidence live in `@/lib/security/csp`, with `CSP_REPORT_ONLY=1` as the
 * way back if a completed payment ever proves it wrong.
 *
 * Violations report to `/api/v1/csp-report`, which alerts on each
 * distinct one — and keeps doing so now the policy is enforced, which is
 * how a mistake here shows up as a message rather than as a customer
 * who could not pay.
 */

/**
 * Device APIs, allowed only where this app actually uses one.
 *
 * `camera` is the parcha scanner's rear-camera capture, `microphone` is
 * the header's voice search, and `geolocation` is the "use my location"
 * area picker. Each is `(self)` — available to this origin and denied to
 * every embedded third party, Razorpay's modal included, which has no
 * business with any of them. Everything else is denied outright.
 */
const PERMISSIONS_POLICY = [
  "camera=(self)",
  "microphone=(self)",
  "geolocation=(self)",
  "payment=()",
  "usb=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "interest-cohort=()",
].join(", ");

/**
 * Keeps the Supabase session alive across a navigation.
 *
 * Access tokens are short-lived and refresh against the refresh token.
 * The refreshed pair has to be *written back* as cookies, and the proxy
 * is the only place in an App Router request that can do that on a page
 * load — a Server Component may not set a cookie, which is why
 * `supabaseReadClient()` swallows writes and why this exists to make that
 * safe (see `src/lib/auth/supabase.ts`).
 *
 * `getSession()` rather than `getUser()`, and the distinction is the
 * point: `getSession` reads the cookie and renews it only when it is
 * actually due, where `getUser` calls the Auth server on *every*
 * navigation — a network round trip in front of every page a customer
 * opens. Its return value is deliberately thrown away. Nothing here
 * trusts it; identity is established in `session.ts` by verifying the
 * JWT's signature. This call is a refresh trigger and nothing more.
 *
 * Reads `process.env` directly rather than importing `@/lib/env`: this
 * module runs on the edge runtime, and that one throws at import unless
 * `DATABASE_URL` and `AUTH_SECRET` are present — neither of which has any
 * business being in the edge bundle.
 */
async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  /* Signed-out visitors are most of a storefront's traffic and must not
     pay for this. No session cookie, nothing to refresh. */
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSession) return response;

  let result = response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        /* Both halves are required. The request copy is what any later
           read in this same pass sees; the response copy is what reaches
           the browser. Writing only the response leaves this request
           still holding the stale token. */
        for (const { name, value } of list) {
          request.cookies.set(name, value);
        }
        result = NextResponse.next({ request });
        /* `NextResponse.next` starts with bare headers, so the security
           headers set by the caller would be lost here. Carried over
           rather than re-derived. */
        for (const [key, value] of response.headers) {
          result.headers.set(key, value);
        }
        for (const { name, value, options } of list) {
          result.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    await supabase.auth.getSession();
  } catch {
    /* A refresh that cannot reach Supabase must not take the page down
       with it. The customer keeps the cookies they arrived with; the
       request is served, and `getSession` will read them as signed out
       if they have genuinely expired. */
  }

  return result;
}


/**
 * Where the storefront lives, for sending a misdirected request there.
 *
 * `process.env` rather than `siteOrigin()` for the reason
 * `refreshSupabaseSession` records below: this module runs on the edge
 * runtime and `@/lib/env` throws there. Returns `null` when the site's
 * own address is not configured, in which case a storefront path asked
 * for on the admin host is answered with a 404 rather than a redirect to
 * a guess.
 */
function appOrigin(): string | null {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

/**
 * Two addresses, one deployment.
 *
 * `/admin` on the public storefront answers 404 — not a redirect, which
 * would tell every scanner walking `quoin.co.in` exactly where the
 * console moved to — and the storefront on the admin host is sent back to
 * where it belongs, so that one catalogue does not end up served, and
 * indexed, under two names.
 *
 * Runs before anything else in the proxy: a request that this host
 * must not answer should not have a Supabase session refreshed for it on
 * the way to being refused.
 *
 * The whole decision is `hostVerdict` in `@/lib/auth/admin-host`, which
 * is a pure function and tested as one. This only carries out the
 * sentence.
 */
/**
 * Whether this request carries *a* session cookie, of either kind.
 *
 * A hint for choosing where to send someone, never an authorisation: it
 * reads names, not contents, and `requireStaffPage` verifies the session
 * and the identity on the very next request regardless. Both kinds are
 * checked because this app has two — Google sign-in mints the legacy
 * `quoin_session` JWT, and phone sign-in leaves Supabase's `sb-*`
 * token pair — and landing a signed-in administrator on a sign-in page
 * because the wrong one was looked for is exactly the papercut this is
 * meant to remove.
 */
function looksSignedIn(request: NextRequest): boolean {
  if (request.cookies.has(SESSION_COOKIE)) return true;
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

function enforceHostSplit(request: NextRequest): NextResponse | null {
  const verdict = hostVerdict({
    /* `x-forwarded-host` first: behind Vercel's proxy that is the name
       the browser asked for, where `host` can be the internal one. */
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    adminHost: process.env.ADMIN_HOST ?? null,
    inProduction: process.env.NODE_ENV === "production",
  });

  if (verdict.kind === "serve") return null;

  if (verdict.kind === "admin_root") {
    /* Signed out, send them to sign-in with the console as the
       destination, rather than to an `/admin` that answers 404 and
       leaves the person who just typed the admin hostname with nowhere
       to go. The cookie is only read for its *presence* — nothing here
       trusts it, and `requireStaffPage` verifies the session and the
       identity on the next request either way. `/signin` is a public
       page on this host already. */
    const target = looksSignedIn(request) ? "/admin" : "/signin?next=/admin";
    return NextResponse.redirect(new URL(target, request.nextUrl.origin), 307);
  }

  if (verdict.kind === "belongs_to_app") {
    const origin = appOrigin();
    if (origin) {
      const target = new URL(
        request.nextUrl.pathname + request.nextUrl.search,
        origin,
      );
      /* 307, not 308: a permanent redirect is cached by browsers for
         good, and this arrangement must stay reversible by unsetting one
         environment variable. */
      return NextResponse.redirect(target, 307);
    }
  }

  /* Deliberately bodiless and deliberately indistinguishable from any
     other 404 this app serves. Confirming that an internal tool exists
     somewhere, to someone who asked for it on the wrong host, is the
     reconnaissance `notFound()` exists to avoid — the same reasoning as
     `requireStaff` in src/lib/http.ts. */
  return new NextResponse(null, {
    status: 404,
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function proxy(request: NextRequest) {
  const misdirected = enforceHostSplit(request);
  if (misdirected) return misdirected;

  let response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  /* Full URL to this origin, bare origin to anyone else. A product URL
     carries a slug and a search URL carries a query, and neither belongs
     in a third party's logs. */
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  /* Belt and braces with `frame-ancestors`, which now enforces too.
     Kept because the two are not the same rule everywhere: a browser
     that honours neither is not worth designing for, but one that
     honours only the older header still exists. */
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  /* Enforced since 24 November. `CSP_REPORT_ONLY=1` puts it back
     without a deploy — see the note in `@/lib/security/csp`. */
  response.headers.set(
    cspHeaderName({ CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY }),
    contentSecurityPolicy(),
  );

  /* Nothing on the admin host is for a search engine, and `robots.txt`
     alone would not say so: it is served by the storefront's own route,
     which allows crawling. A header on every response from this host is
     the version that cannot drift out of step with the split. */
  const adminHost = configuredAdminHost();
  if (
    adminHost &&
    normalizeHost(
      request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    ) === adminHost
  ) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  /* Vercel already sends HSTS on its own domains, but a custom domain is
     served by the same code and must not quietly lose it. Set here so the
     guarantee follows the application rather than the host. Only over
     HTTPS: sending it on a plaintext development request is meaningless
     and would pin localhost to HTTPS in the developer's browser. */
  if (request.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  /* Last, so the headers above are already on the response this carries
     over when a refresh replaces it. */
  response = await refreshSupabaseSession(request, response);

  return response;
}

export const config = {
  /**
   * Everything a person's browser renders, and nothing else.
   *
   * Next's own build output under `/_next/static` is immutable, hashed
   * and served from the edge; running the proxy over it would add a
   * function invocation to every chunk and every image for headers that
   * do nothing on a static asset. `/api` is excluded for a different
   * reason: those responses are JSON read by `fetch` and by the planned
   * native client, and a CSP or a frame policy on a JSON body is noise —
   * their protection is the authorization in `src/lib/http.ts`.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|apple-touch-icon.png|manifest.webmanifest).*)",
  ],
};
