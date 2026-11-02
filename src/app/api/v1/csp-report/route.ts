import { NextResponse } from "next/server";
import { z } from "zod";
import { raise } from "@/lib/alerts";
import { check, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/csp-report — where a blocked resource is reported.
 *
 * **Why this is the next step on CSP rather than enforcing it.** The
 * policy in `middleware.ts` is sent as `Content-Security-Policy-Report-
 * Only`, and the note there says what has to happen before the header is
 * renamed: watch a real test payment and a real Studio clip through it,
 * and fix whatever it names. The gap is the naming. Report-only without
 * a `report-uri` tells each *visitor's* browser console and nobody else
 * — so the precondition for enforcing was unmeetable, not merely unmet.
 * With this endpoint the policy produces evidence, and enforcing becomes
 * a decision somebody can make from data instead of from hope.
 *
 * Deliberately **not** wrapped in `handler()`. Three reasons, all from
 * who the caller is:
 *
 * - A browser posts this unauthenticated and ignores the body. This
 *   app's `{ data }` / `{ error }` envelope would be written for nobody.
 * - It always answers 204, including for rubbish. A non-2xx teaches a
 *   browser to retry a report, which is the opposite of useful, and
 *   tells anyone probing the endpoint which bodies it liked.
 * - A 500 from `handler()` here would raise an `unhandled_5xx` alert
 *   about the endpoint whose whole job is raising alerts.
 *
 * **The body is attacker-controlled.** Anyone can post anything here;
 * being a CSP report is a claim, not a fact. So it is capped before it
 * is read, parsed into a known shape, and reduced to three short fields
 * before anything is reported — never echoed. `document-uri` in
 * particular is cut to its path: the page URL can carry a search query,
 * and a query can carry whatever the customer typed.
 */

/** A report is a few hundred bytes. Anything larger is not one. */
const MAX_BYTES = 8_192;

/**
 * The subset of the `report-uri` body worth having.
 *
 * `passthrough` on the inner object because browsers disagree about the
 * rest of the fields and a strict shape would reject Firefox for
 * including something Chrome does not. Only these three are read.
 */
const Report = z.object({
  "csp-report": z
    .object({
      "effective-directive": z.string().max(100).optional(),
      "violated-directive": z.string().max(100).optional(),
      "blocked-uri": z.string().max(2_000).optional(),
      "document-uri": z.string().max(2_000).optional(),
    })
    .passthrough(),
});

/**
 * One alert per distinct violation per window, not one per report.
 *
 * A directive that fires on the home page fires for every visitor, and
 * the second report adds nothing the first did not say. Keyed by
 * directive and blocked origin — the two things that decide what a fix
 * would be — so a genuinely new violation still gets through
 * immediately while a known one goes quiet.
 *
 * In memory, so it resets when the instance does and a long-running
 * instance does not grow without bound. Both are fine: re-alerting
 * after a cold start is a repeat, and a repeat is cheaper than silence.
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
 * The origin of a blocked URI, or the keyword it actually is.
 *
 * `blocked-uri` is sometimes a URL and sometimes one of `inline`,
 * `eval`, `data` or `self`. Reducing a URL to scheme and host keeps the
 * part a policy is written against and drops the path, which is both
 * noise and the part most likely to carry something personal.
 */
function origin(uri: string | undefined): string {
  if (!uri) return "unknown";
  if (!uri.includes("://")) return uri.slice(0, 40);
  try {
    return new URL(uri).origin;
  } catch {
    return "unparseable";
  }
}

/** The page's path, never its query. */
function pagePath(uri: string | undefined): string {
  if (!uri) return "unknown";
  try {
    return new URL(uri).pathname.slice(0, 120);
  } catch {
    return "unparseable";
  }
}

export async function POST(request: Request) {
  /* 204 on every path below. The browser is told "received" and nothing
     else, whatever happened. */
  const no = () => new NextResponse(null, { status: 204 });

  const { allowed } = check("cspReport", rateLimitKey(request.headers));
  if (!allowed) return no();

  const raw = await request.text().catch(() => "");
  if (raw.length === 0 || raw.length > MAX_BYTES) return no();

  let report: z.infer<typeof Report>["csp-report"];
  try {
    report = Report.parse(JSON.parse(raw))["csp-report"];
  } catch {
    return no();
  }

  const directive =
    report["effective-directive"] ?? report["violated-directive"] ?? "unknown";
  const blocked = origin(report["blocked-uri"]);

  if (firstTimeRecently(`${directive}|${blocked}`)) {
    raise({
      kind: "csp_violation",
      summary: `Content policy would have blocked ${blocked} (${directive})`,
      detail: { directive, blocked, page: pagePath(report["document-uri"]) },
    });
  }

  return no();
}
