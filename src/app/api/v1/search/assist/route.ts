import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import { callerIp, hashIp } from "@/lib/data/parcha-submissions";
import { enforceKeyed } from "@/lib/rate-limit";
import { AiError, isAiConfigured } from "@/lib/ai/client";
import { ASSIST_MESSAGE } from "@/lib/ai/messages";
import { MAX_TRANSCRIPT_CHARS, readRequest } from "@/lib/ai/assistant";
import { matchGuesses } from "@/lib/data/ai-match";
import { getCategories } from "@/lib/data/catalog";
import { listServices } from "@/lib/data/services";

/**
 * POST /api/v1/search/assist
 *
 * The voice assistant behind the microphone in the search field. The
 * browser transcribes speech with the Web Speech API — on the device,
 * free, and no audio leaves it — and posts the *text* here. This route
 * works out what was wanted and answers with products, services, or a
 * nudge towards a consultation.
 *
 * **Text, not audio, and that is a design decision rather than a
 * shortcut.** Sending the recording to a speech model would cost money
 * per utterance and would mean a customer's voice leaving their phone for
 * a third party; the browser already does the transcription well in
 * Indian English. What the model here is for is the *interpretation* —
 * "something that won't get slippery, about eighty square feet" is a
 * sentence no catalogue lookup can answer, and it is the only part that
 * needs a model.
 *
 * The same three guarantees as every other AI route: the key stays on the
 * server, a failure is a failure rather than an invented answer, and
 * nothing upstream is echoed to the customer. See `src/lib/ai/client.ts`.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/** How many products per identified item. Fewer than the photograph
    search: a spoken request usually names one or two things, and the
    screen it lands on is a list rather than a grid. */
const PER_GUESS = 6;

const Body = z.object({
  /**
   * What the browser heard. Capped at the same length the assistant
   * module enforces, so an over-long body is a field error rather than a
   * silent truncation the customer cannot see.
   */
  transcript: z
    .string()
    .trim()
    .min(2, "We did not catch that")
    .max(MAX_TRANSCRIPT_CHARS, "That is longer than we can work with — try one sentence"),
});

export const POST = handler(async (request) => {
  if (!isAiConfigured()) {
    throw new ApiError("conflict", ASSIST_MESSAGE.not_configured);
  }

  const { transcript } = await parseBody(request, Body);

  const session = await getSession();
  const key = session
    ? `u:${session.userId}`
    : `ip:${hashIp(callerIp(request.headers))}`;
  enforceKeyed(
    "aiAssist",
    key,
    (seconds) => `A lot of requests just now. Try again in ${seconds} seconds, or search by typing.`,
  );

  /* The real taxonomy on both axes, for the reason `assistant.ts`
     records: ungrounded, a model answers with its own slugs and every one
     of them is a filter that matches nothing. Two cheap reads, run
     together — `listServices` does not touch the database at all. */
  const [categories, services] = await Promise.all([getCategories(), listServices()]);

  let reading;
  try {
    reading = await readRequest({
      transcript,
      departments: categories.map((c) => ({ slug: c.slug, name: c.title })),
      services: services.map((s) => ({ slug: s.slug, name: s.name, summary: s.summary })),
    });
  } catch (error) {
    if (error instanceof AiError) {
      throw new ApiError(
        error.failure === "rate_limited" ? "rate_limited" : "conflict",
        ASSIST_MESSAGE[error.failure],
      );
    }
    throw error;
  }

  const matches = await matchGuesses(reading.guesses, PER_GUESS);

  /* Resolved here rather than in the client so the browser is handed
     whole service cards and does not need its own copy of the services
     list to look slugs up in. */
  const bySlug = new Map(services.map((s) => [s.slug, s]));

  return ok({
    reply: reading.reply,
    intent: reading.intent,
    followUp: reading.followUp,
    suggestConsult: reading.suggestConsult,
    matches: matches.map((match) => ({
      label: match.guess.label,
      detail: match.guess.detail,
      brand: match.guess.brand,
      department: match.department,
      products: match.products,
    })),
    services: reading.serviceSlugs.flatMap((slug) => {
      const service = bySlug.get(slug);
      return service
        ? [{ slug: service.slug, name: service.name, summary: service.summary, icon: service.icon }]
        : [];
    }),
  });
});
