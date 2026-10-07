import { createHmac } from "node:crypto";
import { ApiError } from "@/lib/http";
import { env } from "@/lib/env";

/**
 * Rate limiting for the public catalogue endpoints.
 *
 * Three routes in this app are open to anyone, take a body, and run real
 * database work for every call: `/api/v1/search` (the command palette,
 * which fires on keystrokes), `/api/v1/parcha` (up to forty catalogue
 * lookups per request) and `/api/v1/checkout/quote` (re-prices a whole
 * basket). None of them had any limit at all — verified against
 * production, where twenty-five consecutive search calls and fifteen
 * parcha pricing calls all answered 200 — while OTP requests, uploads and
 * parcha extraction have been limited since they were written.
 *
 * That gap matters more than it looks. These are not expensive in the way
 * an SMS or an OpenAI call is expensive, so there is no bill to run up;
 * what they cost is Postgres connections, and this deployment's pooler is
 * already the least reliable thing in the stack. A loop against search is
 * an outage for everyone else, and it needs no account to run.
 *
 * **In-process, and the honest description of what that buys.** The map
 * below lives in one serverless instance, so a burst spread across
 * instances gets a fresh budget per instance and a determined attacker is
 * not stopped. What it does stop is the realistic case: one browser
 * looping, a runaway retry, a naive scraper, a palette firing on every
 * keystroke. This is the same trade `/api/v1/parcha/extract` already
 * makes and documents, and it is written down here for the same reason —
 * so nobody discovers the limit from an incident. Making it exact means
 * Redis or a counter table; that is the right change the first time this
 * faces real abuse, and the shape of these functions does not have to
 * move when it happens.
 *
 * Deliberately *not* applied to anything behind `requireUser`: those are
 * already bounded by needing an account, and several of them are things a
 * customer legitimately does in bursts.
 */

interface Bucket {
  windowMs: number;
  max: number;
  hits: Map<string, number[]>;
}

/**
 * One bucket per endpoint, so a customer hammering search cannot spend
 * the budget that lets them price a parcha.
 *
 * The numbers are set from what the UI itself does, not from a round
 * figure. Search is the loosest by a wide margin because the command
 * palette fires per keystroke and a real person typing "waterproofing"
 * sends thirteen requests in a few seconds; a limit tighter than that
 * would break the feature it is meant to protect. Quoting is a basket
 * re-price — a handful per checkout. Parcha pricing is a deliberate act
 * someone performs a few times while editing their list.
 */
const BUCKETS: Record<string, Bucket> = {
  search: { windowMs: 60_000, max: 120, hits: new Map() },
  quote: { windowMs: 60_000, max: 40, hits: new Map() },
  parcha: { windowMs: 10 * 60_000, max: 30, hits: new Map() },
  /* The vendor dispatch action (`POST /api/v1/vendor/fulfilments/{token}
     /dispatch`), which is the only unauthenticated *write* in this app:
     the 64-hex-character token in the URL is its whole credential, so
     there is no account to bound it by. Its own bucket rather than
     borrowing `parcha`'s, for the reason stated above — a shopkeeper
     tapping a button must not spend the budget that lets a customer
     price their list, and nor the reverse.

     Tighter and longer than the others because the shape of the traffic
     is different: dispatching is a deliberate human act performed once
     per order, so twenty in ten minutes is already far more than a real
     vendor does, while being loose enough that a double-tap, a reload
     and a few orders arriving together all go through. It is not what
     makes the token unguessable — 256 bits does that — it is what makes
     trying cost something. */
  vendorDispatch: { windowMs: 10 * 60_000, max: 20, hits: new Map() },
};

/**
 * Who is being counted.
 *
 * Hashed, never stored or logged raw, exactly as `hashIp` in
 * `parcha-submissions.ts` does it — an address is personal data and these
 * limiters have no reason to hold one. Keyed off the same `AUTH_SECRET`,
 * so rotating that secret resets every in-flight window, which is
 * harmless for a sixty-second bucket.
 */
export function rateLimitKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : (headers.get("x-real-ip") ?? "unknown");
  return createHmac("sha256", env.AUTH_SECRET).update(`rl:${ip}`).digest("hex");
}

/**
 * Records a hit and says whether it is allowed.
 *
 * Returns the seconds until the window frees up when it is not, so the
 * caller can put a real number in front of the customer and a `Retry-
 * After` header on the response, rather than a bare "try later".
 */
export function check(
  bucketName: keyof typeof BUCKETS,
  key: string,
): { allowed: boolean; retryAfterSeconds: number } {
  const bucket = BUCKETS[bucketName];
  const now = Date.now();
  const since = now - bucket.windowMs;

  const recent = (bucket.hits.get(key) ?? []).filter((t) => t > since);

  if (recent.length >= bucket.max) {
    bucket.hits.set(key, recent);
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + bucket.windowMs - now) / 1000)),
    };
  }

  recent.push(now);
  bucket.hits.set(key, recent);
  sweep(bucket, since);

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Keeps the map from growing for the life of the instance.
 *
 * Only runs once the map is already large, so the ordinary request pays
 * nothing for it. A warm Vercel instance can live for hours and would
 * otherwise accumulate one entry per distinct caller for all of it.
 */
function sweep(bucket: Bucket, since: number) {
  if (bucket.hits.size <= 5_000) return;
  for (const [key, times] of bucket.hits) {
    if (times.every((t) => t <= since)) bucket.hits.delete(key);
  }
}

/**
 * The form every route actually wants: check, and throw if refused.
 *
 * `ApiError` carries the `rate_limited` code that `fail()` already maps
 * to a 429, so a limited route needs one line and inherits the same
 * envelope and the same `Retry-After` handling as the OTP endpoint.
 */
export function enforce(bucketName: keyof typeof BUCKETS, request: Request): void {
  const { allowed, retryAfterSeconds } = check(bucketName, rateLimitKey(request.headers));
  if (allowed) return;

  throw new ApiError(
    "rate_limited",
    `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
  );
}
