import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

/* env.ts validates at import time — same setup as the other suites. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { POST } = await import("@/app/api/v1/csp-report/route");

/**
 * The endpoint that makes report-only CSP mean something.
 *
 * `middleware.ts` sends the policy as report-only and its note says the
 * remaining step is to "fix whatever it names" and then enforce. Without
 * a `report-uri` the policy named things to each visitor's own browser
 * console and to nobody able to act, so the precondition was unmeetable
 * rather than unmet. This route is the other half.
 *
 * What is pinned here is what makes it safe to expose: it always answers
 * 204, it never alerts twice for the same violation, and it reduces an
 * attacker-controlled body to three short fields rather than echoing it.
 *
 * Each test uses a distinct directive so the module's own deduplication
 * — which is process-wide and an hour long by design — does not make
 * one test depend on another's order.
 */

function report(body: unknown): Request {
  return new Request("https://quoin.co.in/api/v1/csp-report", {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function violation(directive: string, extra: Record<string, string> = {}) {
  return {
    "csp-report": {
      "effective-directive": directive,
      "blocked-uri": "https://evil.example.com/beacon.js",
      "document-uri": "https://quoin.co.in/products",
      ...extra,
    },
  };
}

/** The lines the console sink wrote, as one string. */
async function alertsFrom(fn: () => Promise<unknown>): Promise<string> {
  const stderr = mock.method(console, "error", () => {});
  try {
    await fn();
    await delay(20);
    return stderr.mock.calls
      .map((call) => call.arguments.map((a) => JSON.stringify(a)).join(" "))
      .join("\n");
  } finally {
    stderr.mock.restore();
  }
}

describe("CSP violation reports", () => {
  it("answers 204 and alerts on a genuine report", async () => {
    let status = 0;
    const logged = await alertsFrom(async () => {
      const res = await POST(report(violation("script-src-elem")));
      status = res.status;
    });

    assert.equal(status, 204, "a browser is told 'received' and nothing else");
    assert.match(logged, /csp_violation/);
    assert.match(logged, /script-src-elem/);
    assert.match(logged, /evil\.example\.com/);
  });

  it("reports the blocked origin, not the whole URL", async () => {
    const logged = await alertsFrom(() =>
      POST(
        report(
          violation("img-src", {
            "blocked-uri": "https://tracker.example.com/pixel?uid=abc123&page=cart",
          }),
        ),
      ),
    );

    assert.match(logged, /tracker\.example\.com/);
    assert.ok(!logged.includes("uid=abc123"), "the query is dropped with the path");
  });

  it("reports the page's path, never its query", async () => {
    /* A page URL can carry a search term, and a search term is whatever
       the customer typed. */
    const logged = await alertsFrom(() =>
      POST(
        report(
          violation("font-src", {
            "document-uri": "https://quoin.co.in/search?q=something+personal",
          }),
        ),
      ),
    );

    assert.match(logged, /"page":"\/search"/);
    assert.ok(!logged.includes("something"), "the query never reaches the alert");
  });

  it("alerts once for a violation, not once per report", async () => {
    /* A directive that fires on the home page fires for every visitor.
       The second report says nothing the first did not. */
    const first = await alertsFrom(() => POST(report(violation("style-src"))));
    assert.match(first, /csp_violation/);

    const second = await alertsFrom(() => POST(report(violation("style-src"))));
    assert.ok(
      !second.includes("csp_violation"),
      "the repeat is counted and dropped",
    );
  });

  it("still alerts for a different violation of the same directive", async () => {
    const logged = await alertsFrom(() =>
      POST(
        report(
          violation("style-src", {
            "blocked-uri": "https://other.example.net/theme.css",
          }),
        ),
      ),
    );

    assert.match(logged, /other\.example\.net/);
  });

  it("accepts rubbish quietly", async () => {
    /* Anyone can post here; being a CSP report is a claim, not a fact.
       A non-2xx would teach a browser to retry and tell a prober which
       bodies were liked. */
    for (const body of ["not json at all", {}, { "csp-report": "a string" }, ""]) {
      const logged = await alertsFrom(async () => {
        const res = await POST(report(body));
        assert.equal(res.status, 204, `204 for ${JSON.stringify(body)}`);
      });
      assert.ok(!logged.includes("csp_violation"), "nothing is raised for rubbish");
    }
  });

  it("refuses a body too large to be a report", async () => {
    const logged = await alertsFrom(async () => {
      const res = await POST(
        report({
          "csp-report": {
            "effective-directive": "script-src",
            "blocked-uri": `https://x.example.com/${"a".repeat(20_000)}`,
          },
        }),
      );
      assert.equal(res.status, 204);
    });

    assert.ok(!logged.includes("csp_violation"), "oversized bodies are dropped");
  });
});
