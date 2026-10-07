import OpenAI from "openai";
import { env } from "@/lib/env";

/**
 * Looking at a photograph and saying what to search for.
 *
 * This is the whole feature, deliberately small: the model does not pick
 * products, rank them, or know our catalogue. It reads the picture and
 * answers with a few plain search words — "porcelain floor tile",
 * "brass pendant light" — and the browser puts those into the same search
 * box a customer would have typed into. The results are then exactly what
 * typed search returns, from the real catalogue, with real prices. Nothing
 * here can invent a product, because nothing here names one.
 *
 * Same three guarantees as `parcha-openai.ts`, for the same reasons: the
 * key never leaves the server, a failure is a failure rather than a
 * plausible guess, and no upstream message reaches the customer.
 */

export const DEFAULT_PHOTO_MODEL = "gpt-5-mini";

const REQUEST_TIMEOUT_MS = 45_000;

/** Image types the model accepts. HEIC is converted in the browser first
    — see `prepareImageForUpload` in `src/lib/parcha-image.ts`. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type PhotoSearchFailure =
  | "not_configured"
  | "unsupported"
  | "nothing_found"
  | "invalid_response"
  | "rate_limited"
  | "timeout"
  | "upstream";

export class PhotoSearchError extends Error {
  constructor(
    readonly reason: PhotoSearchFailure,
    message: string,
  ) {
    super(message);
    this.name = "PhotoSearchError";
  }
}

export interface PhotoReading {
  /** One short sentence: what the picture shows, in a customer's words. */
  description: string;
  /** Search terms, most specific first. Between one and four. */
  terms: string[];
}

export function isPhotoSearchConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export function photoSearchModel(): string {
  const configured = env.OPENAI_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_PHOTO_MODEL;
}

let cachedClient: OpenAI | null = null;

function client(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new PhotoSearchError("not_configured", "OPENAI_API_KEY is not set");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1,
    });
  }
  return cachedClient;
}

const SYSTEM_PROMPT = `You help a customer of an Indian construction-materials, fittings and home-interiors store search its catalogue from a photograph.

Look at the photograph and say what the customer is most likely looking for: a product, a material, a fitting, a finish or a decorative item.

Rules:
- Describe only what is visible. Never invent a brand, a model or a price. Name a brand only if its name is legibly printed in the photograph.
- Answer with plain search words a shopper would type — material first, then type. Examples: "vitrified floor tile", "brass pendant light", "CPVC pipe elbow", "concealed cistern", "wooden door handle".
- Give between one and four terms, most specific first, each two to five words, no punctuation.
- If the photograph shows a room or several objects, pick the one or two products that are most central.
- If the photograph is not of anything one could buy for a building or a home (a face, a screenshot, a blank wall), return an empty terms array.
- "description" is one short sentence in plain English.`;

const RESPONSE_FORMAT = {
  type: "json_schema",
  name: "photo_search_terms",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["description", "terms"],
    properties: {
      description: { type: "string" },
      terms: { type: "array", items: { type: "string" } },
    },
  },
} as const;

/**
 * Reads one photograph. The bytes are inlined as a data URL, so nothing of
 * the customer's is left in a third-party account afterwards.
 */
export async function readPhotoForSearch(input: {
  buffer: Buffer;
  contentType: string;
}): Promise<PhotoReading> {
  const contentType = input.contentType.toLowerCase().split(";")[0].trim();
  if (!IMAGE_TYPES.has(contentType)) {
    throw new PhotoSearchError("unsupported", `Cannot read ${contentType}`);
  }

  let response: OpenAI.Responses.Response;
  try {
    response = await client().responses.create({
      model: photoSearchModel(),
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "What should I search for to find this?" },
            {
              type: "input_image",
              image_url: `data:${contentType};base64,${input.buffer.toString("base64")}`,
              detail: "auto",
            },
          ],
        },
      ],
      max_output_tokens: 1_500,
      text: { format: RESPONSE_FORMAT },
    });
  } catch (error) {
    throw asError(error);
  }

  if (response.status === "incomplete") {
    throw new PhotoSearchError("invalid_response", "Response incomplete");
  }

  const reading = parseReading(response.output_text);
  if (reading.terms.length === 0) {
    throw new PhotoSearchError("nothing_found", "No searchable product in the photograph");
  }
  return reading;
}

/** Reads the model's JSON without trusting any of it. */
export function parseReading(raw: string): PhotoReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PhotoSearchError("invalid_response", "Model did not return JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new PhotoSearchError("invalid_response", "Model JSON was not an object");
  }

  const row = parsed as Record<string, unknown>;
  const description =
    typeof row.description === "string" ? clean(row.description).slice(0, 200) : "";

  const terms: string[] = [];
  if (Array.isArray(row.terms)) {
    for (const entry of row.terms) {
      if (typeof entry !== "string") continue;
      const term = clean(entry).slice(0, 60);
      if (term && !terms.some((t) => t.toLowerCase() === term.toLowerCase())) {
        terms.push(term);
      }
      if (terms.length === 4) break;
    }
  }

  return { description, terms };
}

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function asError(error: unknown): PhotoSearchError {
  if (error instanceof PhotoSearchError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new PhotoSearchError("timeout", error.message);
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return new PhotoSearchError("rate_limited", error.message);
    return new PhotoSearchError("upstream", `${error.status ?? ""} ${error.message}`.trim());
  }
  return new PhotoSearchError("upstream", error instanceof Error ? error.message : String(error));
}
