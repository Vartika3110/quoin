import OpenAI from "openai";
import { env } from "@/lib/env";

/**
 * The one OpenAI client the request-time AI features share.
 *
 * `src/lib/parcha-openai.ts` predates this module and keeps its own
 * client deliberately: its timeout is tuned for a multi-page PDF read and
 * its error vocabulary is the parcha workbench's. Everything added since
 * — visual search, the voice assistant, room visualisation — shares this
 * one, because three copies of "construct a client, cache it, map the
 * SDK's errors onto something a customer can read" is three places to fix
 * the next time the SDK renames a field.
 *
 * Three properties this module exists to guarantee, and they are the same
 * three `parcha-openai.ts` names:
 *
 *  - **The key never leaves the server.** This module reads `env`, which
 *    throws if it is ever bundled for the browser, and nothing here is
 *    importable from a client component. Every caller is a route handler.
 *  - **A failure is a failure, not an invented answer.** Callers throw
 *    `AiError` and the routes turn it into one sentence a customer can
 *    act on. No feature built on this module has a fallback that returns
 *    plausible-looking results — a guessed list is worse than none.
 *  - **Nothing from OpenAI reaches the customer verbatim.** Upstream
 *    messages can carry account and organisation detail, so they are
 *    logged without the key and replaced, the same discipline
 *    `StorageError` and `RazorpayError` follow.
 */

/** ---- Models -------------------------------------------------------------
 *
 * Environment variables rather than constants, for the reason
 * `OPENAI_MODEL` records in `src/lib/env.ts`: model names age faster than
 * deploys, so a model being retired — or an account not being granted one
 * — must be a dashboard change and not a release.
 */

/**
 * Reads photographs and transcripts, and answers in JSON.
 *
 * Vision-capable and cheap, which is what both search features need: one
 * image or one sentence per request, read once. `gpt-4.1-mini` is the
 * drop-in if an account is not granted this one.
 */
export const DEFAULT_REASONING_MODEL = "gpt-5-mini";

/**
 * Draws a product into a photograph of a customer's room.
 *
 * A different class of model and a different bill — an image edit costs
 * cents rather than fractions of one — which is why visualisation is
 * rate-limited per account rather than per address, and why the model is
 * named separately from the one above.
 */
export const DEFAULT_IMAGE_MODEL = "gpt-image-1";

export function reasoningModel(): string {
  const configured = env.OPENAI_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_REASONING_MODEL;
}

export function imageModel(): string {
  const configured = env.OPENAI_IMAGE_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_IMAGE_MODEL;
}

/** Whether any of this works at all. Every feature built on this module
    checks it and degrades to something honest when it is false. */
export function isAiConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

/** ---- Errors ------------------------------------------------------------ */

export type AiFailure =
  /** No `OPENAI_API_KEY`. Not an error the customer caused. */
  | "not_configured"
  /** The input cannot be sent to a model at all — wrong file type. */
  | "unsupported"
  /** The model answered, and found nothing. Not a malfunction. */
  | "empty"
  /** The model answered with something that is not the agreed shape. */
  | "invalid_response"
  /** Upstream rate limit or quota. */
  | "rate_limited"
  /** The request outlived its budget. */
  | "timeout"
  /** Anything else upstream. */
  | "upstream";

export class AiError extends Error {
  constructor(
    readonly failure: AiFailure,
    /** For the server log. Never shown to a customer. */
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** ---- The client -------------------------------------------------------- */

/**
 * How long to wait before giving up.
 *
 * Sits under each route's own `maxDuration` so the timeout that fires is
 * this one — which produces a sentence a customer can read — rather than
 * the platform killing the function and handing the browser a bare 504.
 */
const REQUEST_TIMEOUT_MS = 50_000;

let cached: OpenAI | null = null;

export function aiClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new AiError("not_configured", "OPENAI_API_KEY is not set");
  }
  if (!cached) {
    cached = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      /* One retry, not the SDK's default two: a retry of a 50-second call
         cannot finish inside the function's lifetime, and a request
         retried into a platform timeout looks like a hang rather than a
         failure the customer can act on. */
      maxRetries: 1,
    });
  }
  return cached;
}

/**
 * Turns whatever the SDK threw into an `AiError`.
 *
 * Split by status rather than by message, because the message is the part
 * that changes between SDK versions. The upstream text is logged here and
 * nowhere else — see the note at the top of this file.
 */
export function asAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;

  const status = (error as { status?: number } | null)?.status;
  const name = (error as { name?: string } | null)?.name;

  if (name === "APIUserAbortError" || name === "APIConnectionTimeoutError") {
    return new AiError("timeout", "Request timed out");
  }
  if (status === 429) {
    return new AiError("rate_limited", "Upstream rate limit or quota exhausted");
  }
  if (status === 400 || status === 404) {
    /* A model the account cannot reach lands here, which is the case
       `OPENAI_MODEL` and `OPENAI_IMAGE_MODEL` exist to fix. Worth its own
       log line so that is diagnosable from the server log alone. */
    console.error("[ai] request rejected upstream", {
      status,
      message: (error as { message?: string }).message,
    });
    return new AiError("upstream", `Upstream rejected the request (${status})`);
  }

  console.error("[ai] upstream failure", {
    status,
    message: (error as { message?: string } | null)?.message,
  });
  return new AiError("upstream", "Upstream failure");
}
