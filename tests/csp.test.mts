import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { contentSecurityPolicy, cspHeaderName, isReportOnly } = await import(
  "@/lib/security/csp"
);

/**
 * The content policy, which is now enforced.
 *
 * It was report-only for a month because enforcing it can take a
 * checkout down, and the thing that made enforcing defensible was
 * reading `checkout.razorpay.com/v1/checkout.js` and listing the hosts
 * it names. Those hosts are pinned here, so a future tidy-up that
 * narrows the wildcard has to do it deliberately rather than discover
 * on a Tuesday that nobody can pay.
 *
 * The other half is the switch. `CSP_REPORT_ONLY` is the way back
 * without a deploy, and the thing worth asserting about it is that it
 * fails towards the safer state: anything that is not plainly "yes"
 * leaves the policy enforced.
 */

const directive = (name: string): string => {
  const found = contentSecurityPolicy()
    .split("; ")
    .find((part) => part === name || part.startsWith(`${name} `));
  assert.ok(found, `the policy should carry a ${name} directive`);
  return found;
};

describe("contentSecurityPolicy", () => {
  it("lets Razorpay's modal load, frame and call home", () => {
    /* Every host `checkout.js` names is under `razorpay.com`: api, cdn,
       lumberjack, lumberjack-cx, lumberjack-metrics, api-dark, express.
       The wildcard is what covers them, and the modal itself is an
       iframe on api.razorpay.com. */
    assert.match(directive("script-src"), /https:\/\/checkout\.razorpay\.com/);
    assert.match(directive("script-src"), /https:\/\/\*\.razorpay\.com/);
    assert.match(directive("frame-src"), /https:\/\/\*\.razorpay\.com/);
    assert.match(directive("connect-src"), /https:\/\/\*\.razorpay\.com/);
  });

  it("allows a form to post to Razorpay as well as to itself", () => {
    /* Their flow submits inside their own iframe today. The cost of
       being wrong is a failed payment; the cost of listing it is
       nothing an attacker can use. */
    assert.match(directive("form-action"), /'self'/);
    assert.match(directive("form-action"), /https:\/\/\*\.razorpay\.com/);
  });

  it("keeps the directives that were doing nothing while report-only", () => {
    assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
    assert.equal(directive("object-src"), "object-src 'none'");
    assert.equal(directive("base-uri"), "base-uri 'self'");
    /* Browsers ignore this one outright in a report-only policy, which
       is half the reason for enforcing at all. */
    assert.ok(contentSecurityPolicy().includes("upgrade-insecure-requests"));
  });

  it("still reports, now that it also blocks", () => {
    /* An enforced policy that reports nothing is a policy whose
       mistakes arrive as a customer who could not pay. */
    assert.match(directive("report-uri"), /\/api\/v1\/csp-report/);
  });

  it("leaves Cloudflare Stream allowed for the first clip", () => {
    assert.match(directive("media-src"), /cloudflarestream\.com/);
    assert.match(directive("connect-src"), /cloudflarestream\.com/);
  });
});

describe("cspHeaderName", () => {
  it("enforces by default", () => {
    assert.equal(cspHeaderName({}), "Content-Security-Policy");
    assert.equal(cspHeaderName({ CSP_REPORT_ONLY: "" }), "Content-Security-Policy");
  });

  it("goes back to report-only when asked plainly", () => {
    for (const value of ["1", "true", "TRUE", "yes", " true "]) {
      assert.equal(
        cspHeaderName({ CSP_REPORT_ONLY: value }),
        "Content-Security-Policy-Report-Only",
        `${JSON.stringify(value)} should turn enforcement off`,
      );
    }
  });

  it("fails towards enforcement on anything ambiguous", () => {
    /* A variable misspelt in a dashboard should not quietly disable the
       policy. "0" and "false" especially: somebody setting those means
       "do not report only". */
    for (const value of ["0", "false", "no", "off", "ture", "report-only"]) {
      assert.equal(
        isReportOnly({ CSP_REPORT_ONLY: value }),
        false,
        `${JSON.stringify(value)} should leave the policy enforced`,
      );
    }
  });
});
