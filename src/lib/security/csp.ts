/**
 * The content policy, and whether it is enforced.
 *
 * Lifted out of `proxy.ts` on the day it stopped being report-only, for
 * the reason anything load-bearing gets lifted out: a policy that can
 * take checkout down is worth asserting in a test suite, and a string
 * built inside a middleware module cannot be. The proxy still owns
 * *sending* it; this owns what it says.
 *
 * ## Why it is enforced now
 *
 * The note this replaces said the header would be renamed "once a test
 * payment and a Studio clip both run clean". Neither precondition could
 * be met, and for different reasons:
 *
 * - **The Studio clip does not exist.** Zero `StudioIdea` rows have
 *   `media = VIDEO`, none carries a `videoUid` or a `videoPath`, and
 *   `CF_STREAM_CUSTOMER_CODE` is empty. The Cloudflare entries below
 *   are an allowance for a feature with no content, so there is nothing
 *   for an enforced policy to break.
 * - **The test payment is blocked behind PAY-01**, and waiting for it
 *   meant waiting indefinitely with no policy at all.
 *
 * So the question was answered a different way: by reading
 * `checkout.razorpay.com/v1/checkout.js` and listing every host it
 * names. They are `api`, `cdn`, `lumberjack`, `lumberjack-cx`,
 * `lumberjack-metrics`, `api-dark` and `express`, all under
 * `razorpay.com` — every one already covered by the wildcard below. The
 * modal itself is an iframe on `api.razorpay.com/v1/checkout/public`,
 * covered by `frame-src`. `browser.sentry-cdn.com` appears in the file
 * but only inside a list of error sources to ignore, not as a script it
 * loads. Two `razorpay.in` hosts appear on staging-only code paths.
 *
 * That is evidence rather than hope, and it is why this is now sent as
 * `Content-Security-Policy`.
 *
 * ## The way back, without a deploy
 *
 * `CSP_REPORT_ONLY=1` returns the header to report-only. It exists
 * because the one thing still unverified is a *completed* payment — if
 * the day PAY-01 clears the modal turns out to need something nobody
 * has read about, the fix should be an environment variable and a
 * redeploy, not a commit, a review and a build.
 *
 * ## What enforcing is and is not worth
 *
 * Be honest about this: `script-src` still carries `'unsafe-inline'`
 * and `'unsafe-eval'`, so this is not the policy that stops an injected
 * script. Removing them means nonce-ing Next's hydration bootstrap and
 * the pre-paint theme script, which is real work and a separate change.
 *
 * What enforcing does buy today is the rest of the policy, which was
 * doing nothing at all while the header was report-only: no plugins
 * (`object-src`), no re-pointing of relative URLs (`base-uri`), no
 * framing by anyone (`frame-ancestors`), no form posting off-site
 * (`form-action`), and `upgrade-insecure-requests`, which browsers
 * ignore outright in a report-only policy and which is the one that
 * matters on a page taking card details.
 */

/* The modal's own frame, its API, its CDN and its telemetry hosts.
   Wildcarded because Razorpay moves these between subdomains without
   notice, and a policy that blocks a payment on a Tuesday because they
   renamed a bucket is worse than one scoped to their registrable
   domain. */
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
const RAZORPAY_ANY = "https://*.razorpay.com";

/* Studio clips: HLS manifests and segments are fetched by hls.js, so
   Stream needs `connect-src` and not only `media-src`. No clip exists
   yet; this is the allowance waiting for the first one. */
const CF_STREAM = "https://*.cloudflarestream.com";

/**
 * The policy, as a single string.
 *
 * `'unsafe-inline'` on `style-src` is not negotiable away here: React
 * sets inline styles, and so does every image placeholder in this app.
 *
 * `img-src` takes `https:` wholesale rather than naming the Supabase
 * bucket: catalogue imagery is already restricted at the image
 * optimiser by `remotePatterns` in `next.config.ts`, which is the
 * tighter and more meaningful control, and duplicating the host here
 * would mean a project move needs editing in two places.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${RAZORPAY_SCRIPT} ${RAZORPAY_ANY}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${RAZORPAY_ANY} ${CF_STREAM}`,
    `frame-src 'self' ${RAZORPAY_ANY} ${CF_STREAM}`,
    `media-src 'self' blob: ${CF_STREAM}`,
    "worker-src 'self' blob:",
    /* Nothing in this app is ever framed by anyone. */
    "frame-ancestors 'none'",
    /* The Google sign-in handoff is a navigation, not a form, so `self`
       covers everything this application posts. Razorpay is listed
       anyway: their flow submits inside their own iframe today, and the
       cost of being wrong about that is a failed payment while the cost
       of listing it is nothing an attacker can use — a form posted to
       Razorpay is a form posted to a payment gateway. */
    `form-action 'self' ${RAZORPAY_ANY}`,
    "base-uri 'self'",
    "object-src 'none'",
    /* Turns any accidental `http://` subresource into `https://` rather
       than letting it become mixed content on a page taking card
       details. Ignored entirely while the policy is report-only, which
       is half the argument for enforcing. */
    "upgrade-insecure-requests",
    /* Where a violation is reported — and reports keep coming when the
       policy is enforced, which is how a mistake here becomes visible
       rather than merely broken. `report-uri` is deprecated in favour
       of `report-to` and is still the one every browser implements;
       `report-to` additionally needs a `Reporting-Endpoints` header and
       a named group, worth adding the day a browser drops this one. */
    "report-uri /api/v1/csp-report",
  ].join("; ");
}

/**
 * Which header carries it.
 *
 * Takes the environment rather than reading it, so a test can cover
 * both states in one process — `env.ts` freezes its view at import and
 * this module is read by the edge runtime, which must not import it.
 */
export function cspHeaderName(source: { CSP_REPORT_ONLY?: string }): string {
  return isReportOnly(source)
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}

/**
 * Report-only is opt-in, and deliberately strict about what counts.
 *
 * `"1"`, `"true"` and `"yes"` turn enforcement off. Anything else —
 * including `"0"`, `"false"`, an empty string and a typo — leaves the
 * policy enforced. A variable misspelt in a dashboard should fail
 * towards the safer state, not quietly away from it.
 */
export function isReportOnly(source: { CSP_REPORT_ONLY?: string }): boolean {
  const raw = source.CSP_REPORT_ONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
