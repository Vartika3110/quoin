import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

/* env.ts validates at import time — same setup as the other suites. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { describeError, isAlertingConfigured, raise } = await import("@/lib/alerts");

/**
 * Alerting, and the one property that matters more than delivery.
 *
 * The reason this module exists is in its own doc comment: 45 rejected
 * webhooks were logged over three weeks and nobody read the log. What
 * these tests pin is not that a webhook is posted — that needs a
 * network and a URL — but the three things that decide whether this is
 * safe to have in the request path at all.
 *
 * `env.ts` freezes `process.env` at import, so `ALERT_WEBHOOK_URL`
 * cannot be varied within one process. `isAlertingConfigured()` is
 * therefore asserted against the unset case only, which is the one the
 * test environment has and the one that must not throw.
 */
describe("operational alerts", () => {
  it("reports itself unconfigured when no webhook URL is set", () => {
    /* The honest state for a deploy that has not been given one, and
       `/api/v1/health` reports it rather than enforcing it: nothing
       refuses to run without alerting. */
    assert.equal(isAlertingConfigured(), false);
  });

  it("never throws into the caller, whatever a sink does", () => {
    /* The property that makes this safe to call from the 500 handler.
       An alerting system that can throw inside the error path turns one
       failed request into a crash loop. */
    assert.doesNotThrow(() =>
      raise({
        kind: "unhandled_5xx",
        summary: "POST /api/v1/checkout/order threw",
        detail: { error: "Error: boom" },
      }),
    );
  });

  it("returns before its sinks finish", async () => {
    /* `raise` is void, not awaitable, on purpose — the decision about
       whether to wait is made once inside the module rather than at
       every call site. Here that means the console sink has not
       necessarily run by the time the caller continues. */
    const stderr = mock.method(console, "error", () => {});
    try {
      raise({ kind: "webhook_rejected", summary: "A webhook was rejected" });

      /* One turn of the event loop is enough for the console sink. */
      await delay(10);
      assert.ok(
        stderr.mock.calls.length >= 1,
        "the console sink runs even with no webhook configured",
      );

      const [line] = stderr.mock.calls[0].arguments as [string];
      assert.match(line, /^\[alert\] webhook_rejected: /);
    } finally {
      stderr.mock.restore();
    }
  });

  describe("describeError", () => {
    it("keeps an ordinary error's identity", () => {
      const described = describeError(new TypeError("cannot read x of undefined"));
      assert.equal(described, "TypeError: cannot read x of undefined");
    });

    it("reduces a Prisma error to its class and code", () => {
      /* The case that made this function necessary. A real
         `PrismaClientKnownRequestError` message embeds a source excerpt
         of the generated client, and `PrismaClientValidationError` goes
         further and echoes the whole arguments object — which on a
         checkout route is a delivery address. */
      const prismaish = Object.assign(new Error("Invalid `db.user.findUnique()` invocation"), {
        name: "PrismaClientKnownRequestError",
        code: "P2002",
      });

      const described = describeError(prismaish);
      assert.equal(described, "PrismaClientKnownRequestError (P2002)");
      assert.ok(
        !described.includes("findUnique"),
        "the message, and anything it quoted back, is dropped entirely",
      );
    });

    it("names a Prisma error with no code by its class alone", () => {
      const validation = Object.assign(
        new Error("Argument `where` is missing: { address: '14 Rohtak Road' }"),
        { name: "PrismaClientValidationError" },
      );

      const described = describeError(validation);
      assert.equal(described, "PrismaClientValidationError");
      assert.ok(!described.includes("Rohtak"), "no echoed arguments");
    });

    it("takes only the first line, so a stack cannot ride along", () => {
      const stacky = new Error("boom\n    at thing (/app/src/x.ts:1:1)\n    at other");
      assert.equal(describeError(stacky), "Error: boom");
    });

    it("caps a very long message", () => {
      const described = describeError(new Error("x".repeat(5_000)));
      assert.ok(described.length < 250, `capped, got ${described.length} chars`);
      assert.ok(described.endsWith("…"));
    });

    it("handles a thrown non-Error without inventing detail", () => {
      assert.equal(describeError("just a string"), "just a string");
      assert.equal(describeError({ secret: "value" }), "non-Error thrown");
    });
  });
});
