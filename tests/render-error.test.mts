import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

/* env.ts validates at import time — same setup as the other suites. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { POST, cleanPath } = await import("@/app/api/v1/render-error/route");

/**
 * The endpoint that makes a broken page audible.
 *
 * `handler()` raises `unhandled_5xx` for API routes and nothing else,
 * so a Server Component that cannot reach the database, or a client
 * component that throws on hydration, reached the customer's error
 * boundary and nobody else at all. This route is the other half, and it
 * is exposed to the open internet, so what is pinned here is what makes
 * that safe.
 *
 * Three properties matter and each has a test: it always answers 204,
 * whatever it is sent; it never alerts twice for the same fault; and it
 * takes a digest and a path and refuses everything else, because a
 * render error's message can carry whatever the page was holding when
 * it threw.
 *
 * Each test uses a distinct digest, since deduplication is process-wide
 * and an hour long by design.
 */

function post(body: unknown): Request {
  return new Request("https://quoin.co.in/api/v1/render-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
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

describe("POST /api/v1/render-error", () => {
  it("answers 204 and raises one alert naming the page", async () => {
    const line = await alertsFrom(async () => {
      const res = await POST(post({ boundary: "app", digest: "aaa111", path: "/c/paints" }));
      assert.equal(res.status, 204);
      assert.equal(res.headers.get("content-type"), null);
    });

    assert.match(line, /render_error/);
    assert.match(line, /\/c\/paints/);
    assert.match(line, /aaa111/);
  });

  it("says plainly when the root layout is the thing that failed", async () => {
    const line = await alertsFrom(() =>
      POST(post({ boundary: "global", digest: "bbb222", path: "/cart" })),
    );

    /* A page throwing and the layout failing are a different morning,
       and the alert should not make the reader work that out. */
    assert.match(line, /root layout/);
    assert.match(line, /whole page is down/);
  });

  it("alerts once for the same fault, however many visitors hit it", async () => {
    const first = await alertsFrom(() =>
      POST(post({ boundary: "app", digest: "ccc333", path: "/products" })),
    );
    const second = await alertsFrom(() =>
      POST(post({ boundary: "app", digest: "ccc333", path: "/products" })),
    );

    assert.match(first, /ccc333/);
    assert.equal(second, "", "the second report of the same fault should be silent");
  });

  it("treats a different page as a different fault", async () => {
    await alertsFrom(() =>
      POST(post({ boundary: "app", digest: "ddd444", path: "/cart" })),
    );
    const other = await alertsFrom(() =>
      POST(post({ boundary: "app", digest: "ddd444", path: "/checkout" })),
    );

    assert.match(other, /checkout/, "same digest on another path is news");
  });

  it("still answers 204 for rubbish, and raises nothing", async () => {
    for (const body of ["", "not json", "{}", JSON.stringify({ boundary: "nowhere" })]) {
      const line = await alertsFrom(async () => {
        const res = await POST(post(body));
        assert.equal(res.status, 204, `body ${JSON.stringify(body)} should still answer 204`);
      });
      assert.equal(line, "", `body ${JSON.stringify(body)} should raise nothing`);
    }
  });

  it("refuses a digest that is not a hash", async () => {
    /* The field is the one identifier this endpoint reports verbatim.
       Anything that is not `[A-Za-z0-9_-]+` is somebody trying to put
       a sentence — or a payload — into an alert a human will read. */
    const line = await alertsFrom(async () => {
      const res = await POST(
        post({ boundary: "app", digest: "card 4111 1111 1111 1111", path: "/checkout" }),
      );
      assert.equal(res.status, 204);
    });
    assert.equal(line, "");
  });

  it("ignores a body too large to be a report", async () => {
    const line = await alertsFrom(async () => {
      const res = await POST(
        post({ boundary: "app", digest: "eee555", path: `/${"x".repeat(4_000)}` }),
      );
      assert.equal(res.status, 204);
    });
    assert.equal(line, "", "4KB is not a digest and a path");
  });

  it("never reports a query string", async () => {
    const line = await alertsFrom(() =>
      POST(post({ boundary: "app", digest: "fff666", path: "/search?q=my+home+address" })),
    );

    assert.match(line, /fff666/);
    assert.doesNotMatch(line, /home\+address/, "the query is the customer's words");
  });
});

describe("cleanPath", () => {
  it("keeps the path and drops everything after it", () => {
    assert.equal(cleanPath("/c/paints?sort=price#top"), "/c/paints");
    assert.equal(cleanPath("/cart"), "/cart");
  });

  it("refuses anything that is not a path", () => {
    /* A full URL would let a report name somebody else's origin in an
       alert, which is how a reader ends up clicking one. */
    assert.equal(cleanPath("https://evil.example.com/steal"), "unknown");
    assert.equal(cleanPath(undefined), "unknown");
    assert.equal(cleanPath(""), "unknown");
  });

  it("caps a long path", () => {
    assert.equal(cleanPath(`/${"a".repeat(400)}`).length, 120);
  });
});
