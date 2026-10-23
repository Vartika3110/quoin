import type OpenAI from "openai";
import { AiError, aiClient, asAiError, reasoningModel } from "@/lib/ai/client";
import type { VisionGuess } from "@/lib/ai/visual-search";

/**
 * The voice assistant behind the microphone in the search field.
 *
 * The microphone used to be a dictation button: the Web Speech API
 * transcribed one sentence and the transcript was pasted into `?q=`.
 * That works for "Jaquar shower head" and fails for everything a person
 * actually says out loud — "I need to redo my bathroom floor, about
 * eighty square feet, something that won't get slippery" is a sentence,
 * and a catalogue `contains` lookup on a sentence returns nothing.
 *
 * So the transcript comes here instead. This module turns what somebody
 * said into the three things the storefront can act on: whether they want
 * a **product** or a **service**, which catalogue words to search, and
 * what they left unsaid that is worth asking back.
 *
 * ## It answers, it does not chat
 *
 * There is no conversation history and no follow-up turn. One utterance
 * in, one structured answer out, and `reply` is a single sentence that
 * says what Quoin understood — not a chat response, and never advice. A
 * storefront assistant that offers opinions about waterproofing is making
 * claims nobody at Quoin reviewed; the expert consultation at `/consult`
 * is where advice is supposed to come from, and `suggestConsult` is how
 * this module points at it.
 *
 * ## Grounding
 *
 * Departments and services are passed in from the database and the
 * services module, for the reason `visual-search.ts` records: without the
 * real taxonomy a model answers with its own, and every slug it invents
 * is a filter that matches nothing.
 */

const MAX_OUTPUT_TOKENS = 3_000;
const MAX_GUESSES = 6;

/** Long enough for anybody's spoken sentence, short enough that this
    endpoint is not a free text-generation API for whoever finds it. */
export const MAX_TRANSCRIPT_CHARS = 400;

/** ---- Output ------------------------------------------------------------ */

/**
 * What the customer is after.
 *
 * `both` is a real and common answer — "I need tiles and someone to lay
 * them" — and collapsing it into one or the other would drop half of
 * what was asked for.
 */
export type AssistIntent = "product" | "service" | "both" | "unclear";

export interface AssistReading {
  /** One sentence back, saying what Quoin understood. Never advice. */
  reply: string;
  intent: AssistIntent;
  /** Products to look for. Same shape the photograph search produces, so
      one resolver and one results component serve both. */
  guesses: VisionGuess[];
  /** Real service slugs, when a trade was asked for. */
  serviceSlugs: string[];
  /**
   * What the customer did not say that Quoin would need to price the job
   * — area, finish, how many. One short question, or null.
   *
   * Shown as a prompt, not asked in a dialogue: the results are rendered
   * either way, because making somebody answer a question before they
   * see anything is how a search box becomes a form.
   */
  followUp: string | null;
  /** True when the request is a judgement call rather than a purchase —
      "what should I use in a damp bathroom". Routes to `/consult`. */
  suggestConsult: boolean;
}

/** ---- The prompt -------------------------------------------------------- */

function systemPrompt(input: {
  departments: { slug: string; name: string }[];
  services: { slug: string; name: string; summary: string }[];
}): string {
  const departments = input.departments.map((d) => `- ${d.slug}: ${d.name}`).join("\n");
  const services = input.services
    .map((s) => `- ${s.slug}: ${s.name} — ${s.summary}`)
    .join("\n");

  return `You interpret spoken requests for Quoin, an Indian construction materials and home services marketplace. The customer has spoken one sentence into a search field. Turn it into a catalogue search.

Quoin's product departments, and the only values allowed in categorySlug:
${departments}

Quoin's services, and the only values allowed in serviceSlugs:
${services}

Return:
- intent: "product" if they want to buy materials or fittings, "service" if they want a person to do work, "both" if they want materials and someone to fit them, "unclear" if you cannot tell what they want.
- guesses: the products to search for. For each: label (plain words, six at most), keywords (2 to 5 single words to search a catalogue with, most distinctive first, in the trade's vocabulary), categorySlug (one slug from the list, or null), brand (only if they named a manufacturer), detail (material, finish, colour or size they mentioned, else null). Empty array when intent is "service".
- serviceSlugs: the services they are asking for, from the list above. Empty array when intent is "product".
- reply: one short sentence stating what you understood, addressed to the customer. Plain, no greeting, no exclamation. Example: "Looking for anti-skid bathroom floor tiles, around 80 square feet."
- followUp: one short question about the single most important thing they did not say that Quoin would need in order to price it — area, quantity, finish, room. Null if they said enough.
- suggestConsult: true if the request is really asking for advice or a judgement — what is best, what should they use, is this a good idea, how should it be done — rather than naming something to buy or book.

Rules:
- Never answer the question they asked. You classify and search; you do not advise. Advice is what suggestConsult is for.
- Never name a brand they did not say.
- Never invent a quantity, a size or a budget they did not state.
- Indian trade vocabulary and units: parcha, CPVC, POP, jhoomar, chowkhat, sq ft, nos, bags, running feet. Hindi and Hinglish requests are normal — interpret them and answer in English.
- If they named a brand, put it in brand and also keep it out of keywords.
- Keywords are single words, never phrases, never colours, never "product" or "material".
- If the transcript is empty, garbled, or not about building, repair, interiors or home services at all, return intent "unclear" with empty arrays and a reply saying you did not catch it.`;
}

const RESPONSE_FORMAT = {
  type: "json_schema",
  name: "assist_reading",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intent", "reply", "guesses", "serviceSlugs", "followUp", "suggestConsult"],
    properties: {
      intent: { type: "string", enum: ["product", "service", "both", "unclear"] },
      reply: { type: "string" },
      guesses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "keywords", "categorySlug", "brand", "detail"],
          properties: {
            label: { type: "string" },
            keywords: { type: "array", items: { type: "string" } },
            categorySlug: { type: ["string", "null"] },
            brand: { type: ["string", "null"] },
            detail: { type: ["string", "null"] },
          },
        },
      },
      serviceSlugs: { type: "array", items: { type: "string" } },
      followUp: { type: ["string", "null"] },
      suggestConsult: { type: "boolean" },
    },
  },
} as const;

/** ---- Reading ----------------------------------------------------------- */

export async function readRequest(input: {
  transcript: string;
  departments: { slug: string; name: string }[];
  services: { slug: string; name: string; summary: string }[];
}): Promise<AssistReading> {
  const transcript = input.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  if (transcript.length < 2) {
    throw new AiError("empty", "Transcript is empty");
  }

  let response: OpenAI.Responses.Response;
  try {
    response = await aiClient().responses.create({
      model: reasoningModel(),
      instructions: systemPrompt(input),
      input: [{ role: "user", content: [{ type: "input_text", text: transcript }] }],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: { format: RESPONSE_FORMAT },
    });
  } catch (error) {
    throw asAiError(error);
  }

  if (response.status === "incomplete") {
    throw new AiError(
      "invalid_response",
      `Response incomplete: ${response.incomplete_details?.reason ?? "unknown"}`,
    );
  }

  return parseAssist(response.output_text, input);
}

/** ---- Validation -------------------------------------------------------- */

export function parseAssist(
  raw: string,
  known: {
    departments: { slug: string }[];
    services: { slug: string }[];
  },
): AssistReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiError("invalid_response", "Model did not return JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new AiError("invalid_response", "Model response is not the agreed shape");
  }

  const body = parsed as Record<string, unknown>;
  const departments = new Set(known.departments.map((d) => d.slug));
  const services = new Set(known.services.map((s) => s.slug));

  const intent: AssistIntent =
    body.intent === "product" ||
    body.intent === "service" ||
    body.intent === "both" ||
    body.intent === "unclear"
      ? body.intent
      : "unclear";

  const guesses: VisionGuess[] = [];
  if (Array.isArray(body.guesses)) {
    for (const entry of body.guesses) {
      if (typeof entry !== "object" || entry === null) continue;
      const row = entry as Record<string, unknown>;

      const label = text(row.label, 80);
      if (!label) continue;

      const keywords = Array.isArray(row.keywords)
        ? row.keywords
            .map((k) => text(k, 40))
            .filter((k): k is string => Boolean(k))
            .flatMap((k) => k.split(/\s+/))
            .filter((k) => k.length >= 2)
            .slice(0, 5)
        : [];
      if (keywords.length === 0) continue;

      const slug = text(row.categorySlug, 80);
      guesses.push({
        label,
        keywords,
        categorySlug: slug && departments.has(slug) ? slug : null,
        brand: text(row.brand, 60),
        detail: text(row.detail, 60),
      });
      if (guesses.length === MAX_GUESSES) break;
    }
  }

  /* Slugs the services module does not have are dropped rather than
     passed through: an unknown slug is a link to a 404, and a dead card
     under "we can send someone" is worse than one card fewer. */
  const serviceSlugs = Array.isArray(body.serviceSlugs)
    ? [
        ...new Set(
          body.serviceSlugs
            .map((s) => text(s, 80))
            .filter((s): s is string => Boolean(s) && services.has(s as string)),
        ),
      ].slice(0, 6)
    : [];

  return {
    intent,
    reply: text(body.reply, 200) ?? "",
    guesses,
    serviceSlugs,
    followUp: text(body.followUp, 160),
    suggestConsult: body.suggestConsult === true,
  };
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}
