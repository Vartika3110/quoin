import { NextResponse } from "next/server";
import { z } from "zod";
import { raise } from "@/lib/alerts";
import { check, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/render-error — a page failed in front of a customer.
 *
 * **The hole this fills.** `handler()` in `http.ts` raises
 * `unhandled_5xx` for anything an API route throws, and that is the only
 * automatic alert the application had. But a storefront does not break
 * at its API routes. It breaks when a Server Component cannot reach the
 * database, when a page is deployed referencing a column that no longer
 * exists, when a client component throws on hydration — and none of
 * those passes through `handler()`. They render `src/app/error.tsx`, the
 * customer sees "Something went wrong", and until this endpoint existed
 * the only record was a `console.error` in that visitor's own browser.
 *
 * That is the same gap, in the same shape, as the one that let forty-five
 * rejected webhooks go unread for three weeks: detected, logged, seen by
 * nobody.
 *
 * **Shaped like `csp-report`, and for the same reasons.** Not wrapped in
 * `handler()` — a 500 here would raise an alert about the endpoint whose
 * job is raising alerts. Always 204, so a browser is never taught to
 * retry a report and a prober learns nothing from which bodies were
 * liked. Rate-limited, because a broken page is broken for everybody at
 * once and every visitor is a reporter.
 *
 * **What it will not accept.** Not the error message, and not a stack.
 * Both are attacker-controlled here — anyone can POST this — and, worse,
 * a genuine one can carry whatever the page was holding when it threw: a
 * delivery address, a basket, a phone number. Next already solves this
 * properly in production by replacing the message with a `digest`, which
 * is a hash that also appears in the server log. The digest is the useful
 * half and the safe half at once, so it is the only identifier taken.
 */

/** A digest and a path. Anything bigger than this is not that. */
const MAX_BYTES = 2_048;

const Report = z.object({
  /* Next's own hash of the error, and the same string the server log
     carries. Absent in development, where the real message is sent to
     the boundary instead and nothing needs correlating. */
  digest: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "a digest is a hash")
    .optional(),
  /* Which boundary caught it. `global` means the root layout itself
     failed, which is a different and much worse morning than one page
     throwing. */
  boundary: z.enum(["app", "global"]),
  /* Sent as a pathname by the boundary, and re-trimmed here anyway:
     the client is not trusted to have done it. */
  path: z.string().max(200).optional(),
});

/**
 * One alert per distinct failure per window.
 *
 * A page that throws throws for every visitor who opens it, and the
 * second report says nothing the first did not. Keyed by digest and
 * path, which together are "what broke, and where" — a new digest is a
 * new fault and gets through at once.
 *
 * In memory, like the CSP reporter's: it resets with the instance,
 * which means a cold start can repeat an alert. A repeat is cheaper
 * than silence.
 */
const WINDOW_MS = 60 * 60_000;
const seen = new Map<string, number>();

function firstTimeRecently(key: string): boolean {
  const now = Date.now();

  if (seen.size > 500) {
    for (const [k, at] of seen) if (now - at > WINDOW_MS) seen.delete(k);
  }

  const last = seen.get(key);
  if (last !== undefined && now - last < WINDOW_MS) return false;

  seen.set(key, now);
  return true;
}

/**
 * The path, with everything after it removed.
 *
 * A search page's query is the words a customer typed and a checkout
 * URL can carry a reference. Neither is needed to find a broken page,
 * and an alert is a place data goes to be read by a person and kept in
 * a chat log.
 */
export function cleanPath(raw: string | undefined): string {
  if (!raw) return "unknown";
  const path = raw.split(/[?#]/, 1)[0].trim();
  if (!path.startsWith("/")) return "unknown";
  return path.slice(0, 120);
}

export async function POST(request: Request) {
  const no = () => new NextResponse(null, { status: 204 });

  const { allowed } = check("renderError", rateLimitKey(request.headers));
  if (!allowed) return no();

  const raw = await request.text().catch(() => "");
  if (raw.length === 0 || raw.length > MAX_BYTES) return no();

  let report: z.infer<typeof Report>;
  try {
    report = Report.parse(JSON.parse(raw));
  } catch {
    return no();
  }

  const digest = report.digest ?? "no-digest";
  const path = cleanPath(report.path);

  if (firstTimeRecently(`${report.boundary}|${digest}|${path}`)) {
    raise({
      kind: "render_error",
      summary:
        report.boundary === "global"
          ? `The root layout failed on ${path} — the whole page is down for that route`
          : `A page threw while rendering ${path}`,
      detail: { boundary: report.boundary, digest, path },
    });
  }

  return no();
}
