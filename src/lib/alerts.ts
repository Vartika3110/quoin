import { env } from "@/lib/env";

/**
 * Telling a human that something broke.
 *
 * **Why this exists.** The Razorpay webhook rejected 45 of the first 46
 * deliveries this application ever received, over three weeks, while
 * customers paid and their orders stayed at `PENDING_PAYMENT`. Every one
 * of those rejections was logged. Nothing read the logs. The gap was
 * never detection — the line `[payments] rejected a webhook with an
 * invalid signature` was printed forty-five times — it was that a log
 * line is only an alert if somebody happens to be looking at it.
 *
 * So this is deliberately not an error-tracking product. It is the
 * smallest thing that closes that specific gap: the two events that
 * would have caught the outage, pushed somewhere a person sees without
 * going to look.
 *
 * **The events.** An unhandled 5xx from any API route, a webhook
 * delivery rejected for a bad signature, and a resource the content
 * policy would have blocked. The first two are raised from the one
 * place each already passes through — `handler()` in `http.ts` and the
 * rejection branch of the Razorpay route — rather than sprinkled
 * around, so there is no way to add a route that quietly opts out. The
 * third arrives from a browser at `/api/v1/csp-report`, which dedupes
 * before it raises: a directive that fires on the home page fires for
 * every visitor.
 *
 * **What an alert may contain.** A summary and a small bag of scalars,
 * and both are written at the call site by code that knows what is safe
 * to say. Nothing here inspects an error object, serialises a request
 * body or reads a parameter: the webhook alert carries a fingerprint and
 * a count, never the body it rejected, and the 5xx alert carries the
 * error's *identity* — its constructor name and message — never a Prisma
 * error whose message echoes the arguments it was called with. That
 * distinction is the one `SEC-14` turns on and it is the reason this
 * module takes a prepared alert rather than an `unknown`.
 *
 * **It cannot break a request.** Every failure path here is swallowed.
 * An alerting system that can 500 the route it is reporting on is worse
 * than no alerting at all.
 */

export type AlertKind = "unhandled_5xx" | "webhook_rejected" | "csp_violation";

export interface Alert {
  kind: AlertKind;
  /** One line, already safe to show a human. */
  summary: string;
  /** Scalars only, already safe. Keys appear verbatim in the message. */
  detail?: Record<string, string | number | boolean | null>;
}

export interface AlertSink {
  send(alert: Alert): Promise<void>;
}

/** A hung endpoint must not hold a serverless invocation open. */
const TIMEOUT_MS = 5_000;

/**
 * Whether an alert reaches anywhere but the log.
 *
 * Unlike the Razorpay and WhatsApp gates this is not load-bearing —
 * nothing refuses to run without it — so it is reported rather than
 * enforced. `/api/v1/health` lists it for the same reason it lists the
 * others: the point of that endpoint is that a half-configured deploy
 * says so out loud.
 */
export function isAlertingConfigured(): boolean {
  return Boolean(env.ALERT_WEBHOOK_URL);
}

/**
 * Always on. Structured so a log search can find every alert by prefix
 * even when nothing else is configured.
 */
class ConsoleSink implements AlertSink {
  async send(alert: Alert): Promise<void> {
    console.error(`[alert] ${alert.kind}: ${alert.summary}`, alert.detail ?? {});
  }
}

/**
 * Posts to an incoming webhook.
 *
 * The body carries `text` *and* `content` holding the same line, which
 * is not redundancy for its own sake: Slack reads `text`, Discord reads
 * `content`, and sending both means the variable can be set to either
 * without this file knowing which. The structured fields ride alongside
 * and are ignored by both; anything else receiving this gets real JSON
 * rather than a sentence it has to parse.
 */
class WebhookSink implements AlertSink {
  constructor(private readonly url: string) {}

  async send(alert: Alert): Promise<void> {
    const line = `[${environmentName()}] ${alert.kind}: ${alert.summary}`;
    const body = {
      text: line,
      content: line,
      kind: alert.kind,
      summary: alert.summary,
      detail: alert.detail ?? {},
      environment: environmentName(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    };

    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      /* Thrown so `raise` logs it. Never the response body: an incoming
         webhook URL is itself a secret and a provider's error can quote
         the request back. */
      throw new Error(`alert webhook returned ${res.status}`);
    }
  }
}

function environmentName(): string {
  return process.env.VERCEL_ENV ?? env.NODE_ENV ?? "unknown";
}

function sinks(): AlertSink[] {
  const out: AlertSink[] = [new ConsoleSink()];
  if (env.ALERT_WEBHOOK_URL) out.push(new WebhookSink(env.ALERT_WEBHOOK_URL));
  return out;
}

/**
 * Raise an alert. Never throws, never rejects, never delays a response
 * by more than `TIMEOUT_MS` in the worst case.
 *
 * Deliberately returns `void` rather than a promise the caller is
 * expected to await. A caller that forgets an `await` on a floating
 * promise gets a serverless instance frozen mid-flight and an alert that
 * silently never sends — so the decision about whether to wait is made
 * here, once, instead of at every call site.
 *
 * Sinks run in parallel and are settled rather than raced: a broken
 * webhook must not stop the console line, which is the sink that always
 * works.
 */
export function raise(alert: Alert): void {
  void Promise.allSettled(sinks().map((sink) => sink.send(alert))).then(
    (results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[alert] a sink failed", result.reason);
        }
      }
    },
  );
}

/** Enough to recognise a fault, too little to be a payload. */
const MAX_DESCRIPTION = 200;

/**
 * The identity of a thrown value, without its contents.
 *
 * **Prisma errors are handled separately, and that is not fussiness.**
 * The first end-to-end test of this module raised an alert whose
 * `message` carried a source excerpt of the generated client; and a
 * `PrismaClientValidationError` goes further and echoes the whole
 * arguments object the call was made with. On a checkout route those
 * arguments are a delivery address. So for anything Prisma throws, only
 * the class and its error code are reported — `P2002` says "unique
 * constraint" as usefully as a paragraph would, and says nothing about
 * whose row it was.
 *
 * Everything else keeps its message, cut to the first line and capped.
 * A multi-line message is a stack or a dump wearing a message's clothes,
 * and neither belongs in an alert.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? clip(error) : "non-Error thrown";
  }

  if (error.name.startsWith("Prisma")) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.name} (${code})` : error.name;
  }

  return clip(`${error.name}: ${error.message}`);
}

function clip(text: string): string {
  const line = text.split("\n", 1)[0].trim();
  return line.length > MAX_DESCRIPTION ? `${line.slice(0, MAX_DESCRIPTION)}…` : line;
}
