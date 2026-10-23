import type OpenAI from "openai";
import { AiError, aiClient, asAiError, reasoningModel } from "@/lib/ai/client";

/**
 * Searching the catalogue with a photograph.
 *
 * Somebody standing in front of a tap, a tile or a hinge they want more
 * of does not know what it is called — and the words they would guess
 * ("that chrome bathroom thing") are the words the catalogue is worst at.
 * A photograph is the question they can actually ask.
 *
 * This module does **one** job: it looks at the image and says what is in
 * it, in the catalogue's own vocabulary. It does not search. Resolving
 * what it says into real products is `src/lib/data/ai-match.ts`, and the
 * split is deliberate — this half talks to a model and can be wrong, that
 * half talks to Postgres and cannot invent a product that is not there.
 *
 * ## Grounding, and why the taxonomy is a parameter
 *
 * The model is handed Quoin's real department list and told to classify
 * into it. Without that it answers with its own taxonomy — "Tiles &
 * Flooring", "Sanitaryware" — and every one of those is a category slug
 * that does not exist here, so the filter built from it returns nothing.
 * Passing the list in rather than hard-coding it means a department
 * renamed in the database is renamed in the prompt on the next request,
 * with no copy here to drift out of date.
 *
 * ## What it must not do
 *
 * Name a brand it cannot actually see. A photograph of an unbranded white
 * tile that comes back "Kajaria" sends the customer to one manufacturer's
 * shelf on the strength of a guess, and they have no way of knowing the
 * logo was never in the frame. `brand` is null unless the mark is legible
 * — that instruction is in the prompt and the field is nullable for it.
 */

/** A cap on how much the model may write back. Generous: a reasoning
    model spends part of this budget before emitting the first object. */
const MAX_OUTPUT_TOKENS = 4_000;

/** Beyond this, the photograph is a room rather than a product, and the
    tail of the list is noise. */
const MAX_GUESSES = 6;

/** What a model can be shown. HEIC is deliberately absent — OpenAI does
    not accept it, and the browser converts before upload (see
    `prepareImageForUpload` in `src/lib/parcha-image.ts`). */
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isVisualSearchContentType(contentType: string): boolean {
  return IMAGE_CONTENT_TYPES.has(contentType.toLowerCase().split(";")[0].trim());
}

/** ---- Output ------------------------------------------------------------ */

/** One thing the model believes is in the photograph. */
export interface VisionGuess {
  /** What it is, as a customer would say it. Shown as the chip label. */
  label: string;
  /**
   * The words to search the catalogue with, most distinctive first.
   *
   * Ordered on purpose: `src/lib/data/ai-match.ts` weights earlier
   * keywords more heavily, because "concealed" finds a hinge and "steel"
   * finds four hundred unrelated fittings.
   */
  keywords: string[];
  /** A real Quoin department slug, or null when none of them fit. */
  categorySlug: string | null;
  /** Only when a logo or printed mark is legible in the frame. */
  brand: string | null;
  /** Material, finish or colour, when visible. Shown under the label. */
  detail: string | null;
}

export interface VisualReading {
  /** One line describing the photograph as a whole. */
  summary: string;
  guesses: VisionGuess[];
}

/** ---- The prompt -------------------------------------------------------- */

function systemPrompt(departments: { slug: string; name: string }[]): string {
  const list = departments.map((d) => `- ${d.slug}: ${d.name}`).join("\n");

  return `You identify building materials, fittings and interior products in photographs for Quoin, an Indian construction and interiors marketplace.

Look at the photograph and list the products in it that a customer could plausibly want to buy, most prominent first.

Quoin's departments, and the only values allowed in categorySlug:
${list}

For each product you identify, return:
- label: what it is, in plain words an Indian customer would use. Six words at most.
- keywords: 2 to 5 single words to search a product catalogue with, ordered most distinctive first. Use the trade's own words. Do not include colours or the word "product".
- categorySlug: exactly one slug from the list above, or null if none of them genuinely fits.
- brand: the manufacturer, ONLY if a logo or printed brand mark is actually legible in the image. If you are inferring it from the style of the product, return null.
- detail: the material, finish or colour you can see — "matte ceramic", "brushed brass", "white PVC". Null if it is not clear.

Rules:
- Identify what is in the photograph. Never invent a product that is not visible.
- Never name a brand you cannot read in the image. Guessing a manufacturer from appearance is forbidden.
- A photograph of a whole room: list the buyable products in it (the tiles, the tap, the light fitting), not the room.
- A photograph of one product: one entry, described precisely.
- Ignore people, pets, text on walls, and anything not for sale.
- Prefer the trade's vocabulary over the consumer's: "concealed hinge" not "cupboard hinge", "CP fitting" not "silver tap".
- At most ${MAX_GUESSES} entries.
- summary: one short sentence saying what the photograph shows.

If the photograph contains nothing a construction or interiors catalogue would sell, return an empty guesses array. Do not pad the list to look useful.`;
}

const USER_INSTRUCTION =
  "Identify the construction or interiors products in this photograph so they can be found in the catalogue.";

/**
 * The agreed shape of the answer, enforced by the API rather than hoped
 * for in prose. `strict` means the model cannot omit a key or add one, so
 * the validation below guards against a genuinely malformed response
 * rather than being the primary defence.
 */
const RESPONSE_FORMAT = {
  type: "json_schema",
  name: "visual_search",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "guesses"],
    properties: {
      summary: { type: "string" },
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
    },
  },
} as const;

/** ---- Reading ----------------------------------------------------------- */

/**
 * Sends one photograph to the model and returns what it saw.
 *
 * The bytes are inlined as a data URL rather than uploaded to the Files
 * API first: one round trip instead of two, nothing of the customer's
 * left sitting in a third-party account after the request, and no
 * orphaned-file cleanup job to write and then forget to run. Exactly the
 * reasoning `readParchaFile` records.
 */
export async function readProductPhoto(input: {
  buffer: Buffer;
  contentType: string;
  /** Quoin's real departments, for grounding. See the note above. */
  departments: { slug: string; name: string }[];
}): Promise<VisualReading> {
  const contentType = input.contentType.toLowerCase().split(";")[0].trim();
  if (!IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new AiError("unsupported", `Cannot read ${contentType}`);
  }

  let response: OpenAI.Responses.Response;
  try {
    response = await aiClient().responses.create({
      model: reasoningModel(),
      instructions: systemPrompt(input.departments),
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: USER_INSTRUCTION },
            {
              type: "input_image",
              image_url: `data:${contentType};base64,${input.buffer.toString("base64")}`,
              /* `high`, not `low`. A tile's finish and a hinge's
                 mechanism are exactly the detail a downsampled
                 thumbnail loses, and they are what distinguishes the
                 right product from forty wrong ones. */
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      /* No `temperature` and no `reasoning`, deliberately: both are
         rejected by one half or the other of the models `OPENAI_MODEL`
         can point at, and a request that 400s the moment someone changes
         that variable defeats the point of having it. */
      text: { format: RESPONSE_FORMAT },
    });
  } catch (error) {
    throw asAiError(error);
  }

  /* Budget exhausted mid-list. The partial output would parse cleanly and
     read as a complete answer quietly missing its last entries. */
  if (response.status === "incomplete") {
    throw new AiError(
      "invalid_response",
      `Response incomplete: ${response.incomplete_details?.reason ?? "unknown"}`,
    );
  }

  const reading = parseReading(response.output_text, input.departments);
  if (reading.guesses.length === 0) {
    throw new AiError("empty", "Nothing in the photograph matches the catalogue");
  }
  return reading;
}

/** ---- Validation -------------------------------------------------------- */

/**
 * Reads the model's JSON without trusting any of it.
 *
 * By hand rather than with Zod, for the reason `parseItems` gives in
 * `parcha-openai.ts`: "invalid" and "empty" are different answers, and
 * each field is salvageable on its own. A guess whose `categorySlug` is
 * not a real department is still a usable guess — the slug is dropped,
 * not the entry — because a bad filter is recoverable and a lost
 * identification is not.
 */
export function parseReading(
  raw: string,
  departments: { slug: string; name: string }[],
): VisualReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiError("invalid_response", "Model did not return JSON");
  }

  if (typeof parsed !== "object" || parsed === null || !("guesses" in parsed)) {
    throw new AiError("invalid_response", "Model response is not the agreed shape");
  }

  const body = parsed as { summary?: unknown; guesses?: unknown };
  if (!Array.isArray(body.guesses)) {
    throw new AiError("invalid_response", "`guesses` is not an array");
  }

  const known = new Set(departments.map((d) => d.slug));
  const guesses: VisionGuess[] = [];

  for (const entry of body.guesses) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;

    const label = text(row.label, 80);
    if (!label) continue;

    const keywords = Array.isArray(row.keywords)
      ? row.keywords
          .map((k) => text(k, 40))
          .filter((k): k is string => Boolean(k))
          /* Single words only. A model asked for words occasionally
             answers with a phrase, and a phrase in the keyword slot is a
             `contains` lookup that matches nothing. */
          .flatMap((k) => k.split(/\s+/))
          .filter((k) => k.length >= 2)
          .slice(0, 5)
      : [];

    /* A guess with no keywords cannot be searched for, and a chip that
       returns nothing when tapped is worse than one that is absent. */
    if (keywords.length === 0) continue;

    const slug = text(row.categorySlug, 80);
    guesses.push({
      label,
      keywords,
      categorySlug: slug && known.has(slug) ? slug : null,
      brand: text(row.brand, 60),
      detail: text(row.detail, 60),
    });

    if (guesses.length === MAX_GUESSES) break;
  }

  return { summary: text(body.summary, 160) ?? "", guesses };
}

/** A trimmed, length-capped string, or null for anything that is not one. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}
