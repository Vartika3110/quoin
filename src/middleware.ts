import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Response headers.
 *
 * This app had none beyond the HSTS Vercel sets for itself: no CSP, no
 * `nosniff`, no referrer policy, no frame protection. A storefront that
 * takes payments and holds addresses should not be in that state, and the
 * fix is one file because there was no `middleware.ts` at all.
 *
 * The split below is the whole design, and it is deliberate.
 *
 * **Enforced: the headers that cannot break a working page.** Refusing to
 * sniff a MIME type, trimming the referrer, declining to be framed and
 * switching off device APIs nothing uses are all changes whose failure
 * mode is "something that was already wrong stops working". They go on
 * now.
 *
 * **Report-only: the CSP.** A content policy is the one header here that
 * can take a checkout down, because it has to allow Razorpay's modal —
 * a third-party script that injects an iframe, talks to its own hosts and
 * is free to add another tomorrow. Shipping a strict policy enforced, on
 * a payment flow that is already the most broken thing in production,
 * would be trading a known problem for an unknown one. So it is sent as
 * `Content-Security-Policy-Report-Only`: browsers evaluate it and log
 * violations to the console, and nothing is blocked. Watch a real test
 * payment and a real Studio video through it, fix whatever it names, and
 * only then rename the header. That rename is the entire remaining step,
 * and there is a note at the constant below marking it.
 */

/**
 * Hosts the browser genuinely has to reach.
 *
 * Everything else this app talks to — OpenAI, WhatsApp, Google's token
 * endpoint, the Cloudflare API — is called from the server and must not
 * appear here. A `connect-src` entry is permission for *page* JavaScript
 * to reach a host, and listing a server-side API would hand that
 * permission to any script that ever got injected.
 */
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
/* The modal's own frame, its API and its telemetry host. Wildcarded
   because Razorpay moves these between subdomains without notice, and a
   policy that blocks a payment on a Tuesday because they renamed a
   bucket is worse than one scoped to their registrable domain. */
const RAZORPAY_ANY = "https://*.razorpay.com";
/* Studio clips: HLS manifests and segments are fetched by hls.js, so
   Stream needs `connect-src` and not only `media-src`. */
const CF_STREAM = "https://*.cloudflarestream.com";

/**
 * The content policy, as a single string.
 *
 * `'unsafe-inline'` on `style-src` is not negotiable away here: React
 * sets inline styles, and so does every image placeholder in this app.
 * `'unsafe-inline'` on `script-src` is there for Next's own hydration
 * bootstrap and the pre-paint theme script in `layout.tsx`; removing it
 * means nonce-ing every inline script through the middleware, which is a
 * real change to make once this is enforced rather than a line to delete.
 *
 * `img-src` takes `https:` wholesale rather than naming the Supabase
 * bucket: catalogue imagery is already restricted at the image optimiser
 * by `remotePatterns` in `next.config.ts`, which is the tighter and more
 * meaningful control, and duplicating the host here would mean a project
 * move needs editing in two places.
 *
 * TO ENFORCE: rename the header below from
 * `Content-Security-Policy-Report-Only` to `Content-Security-Policy`
 * once a test payment and a Studio clip both run clean.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${RAZORPAY_SCRIPT} ${RAZORPAY_ANY}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${RAZORPAY_ANY} ${CF_STREAM}`,
  `frame-src 'self' ${RAZORPAY_ANY} ${CF_STREAM}`,
  `media-src 'self' blob: ${CF_STREAM}`,
  "worker-src 'self' blob:",
  /* Nothing in this app is ever framed by anyone, and no form posts off
     site — the Google sign-in handoff is a navigation, not a form. */
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  /* Turns any accidental `http://` subresource into `https://` rather
     than letting it become mixed content on a page taking card details. */
  "upgrade-insecure-requests",
].join("; ");

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
 * The refreshed pair has to be *written back* as cookies, and middleware
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

export async function middleware(request: NextRequest) {
  let response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  /* Full URL to this origin, bare origin to anyone else. A product URL
     carries a slug and a search URL carries a query, and neither belongs
     in a third party's logs. */
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  /* Belt and braces with `frame-ancestors` above, which the report-only
     CSP is not yet enforcing — this one is enforced today. */
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  response.headers.set("Content-Security-Policy-Report-Only", CSP);

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
   * and served from the edge; running middleware over it would add a
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
