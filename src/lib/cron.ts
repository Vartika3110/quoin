import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Scheduled jobs.
 *
 * Everything under `/api/v1/cron/*` is work that has to happen on a timer
 * with nobody watching: settling a payment whose webhook never arrived,
 * giving back stock a lapsed checkout is still holding. Until now this
 * app had no scheduler at all — `releaseExpiredReservations` carried a
 * comment saying so, and a payment with a dropped webhook had no recovery
 * path whatsoever. The jobs are the recovery path.
 *
 * They are written to the same rules as the Razorpay webhook, and for the
 * same reason — an unattended endpoint that writes money state is the one
 * nobody is looking at when it goes wrong:
 *
 * **Fail closed.** No `CRON_SECRET` means no caller is authenticated, so
 * every request is refused. An unconfigured deploy must not mean an open
 * door; see the note on `CRON_SECRET` in `src/lib/env.ts`.
 *
 * **Constant-time compare**, so the secret cannot be recovered a byte at
 * a time from how quickly the refusal comes back.
 *
 * **Idempotent bodies.** Every job must be safe to run twice, because a
 * scheduler that retries is normal and two overlapping runs are possible.
 * Neither job relies on running exactly once: `settleCapturedPayment`
 * claims its row with a conditional update, and
 * `releaseExpiredReservations` claims the order the same way.
 */

/** GET, because that is the only method Vercel Cron issues. */
export const CRON_METHOD = "GET";

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Whether this request genuinely came from the scheduler.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on every invocation
 * once the variable is set on the project. The same header works from
 * `curl` for a manual run, which is deliberate: a job that can only be
 * triggered by waiting for its schedule cannot be tested, and the one
 * that settles payments is exactly the one somebody will want to run by
 * hand the moment a customer rings about an order.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  return constantTimeEqual(header.slice(prefix.length), secret);
}

/**
 * The refusal, as one response so both jobs answer identically.
 *
 * 404 rather than 401, matching `requireStaff` in `src/lib/http.ts`:
 * confirming that a job endpoint exists at this path, to someone who
 * cannot run it, is free reconnaissance. "Not configured" and "wrong
 * secret" are deliberately indistinguishable for the same reason the
 * webhook handler will not say which of its two failure causes it hit.
 */
export function refuseCron(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
