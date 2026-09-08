import OpenAI from "openai";
import { env } from "@/lib/env";

/**
 * Reading a parcha with a model.
 *
 * `src/lib/parcha.ts` turns *text* into lines. `src/lib/parcha-extract.ts`
 * decides, per file, whether text can be produced at all. This module is
 * the thing that produces it for a photograph or a PDF: it sends the file
 * to OpenAI's Responses API and gets back a structured materials list.
 *
 * Three properties this module exists to guarantee:
 *
 *  - **The key never leaves the server.** Nothing here is importable from
 *    a client component — it reads `env` (which throws if bundled for the
 *    browser) and is only ever reached through
 *    `POST /api/v1/parcha/extract`. The browser posts bytes to that route
 *    and never talks to api.openai.com.
 *  - **A failure is a failure, not an invented list.** Every path that
 *    cannot produce a real reading throws `ParchaReadError` with a reason
 *    the route maps to a customer-facing sentence. There is no fallback
 *    that returns plausible-looking items, because a list nobody read is
 *    worse than no list at all — see the note at the top of
 *    `ParchaWorkbench.tsx`.
 *  - **Nothing from OpenAI reaches the customer verbatim.** Upstream
 *    messages can carry account and organisation detail, so they are
 *    logged (without the key) and replaced, the same discipline
 *    `StorageError` and `RazorpayError` follow.
 *
 * The output is deliberately turned back into *text* — one material per
 * line, in the shape someone would have typed — rather than fed straight
 * into matching. The customer reviews and edits it in the same textarea a
 * typed list lives in, and only then does the existing pricing flow run.
 */

/**
 * The default model.
 *
 * Vision-capable and cost-efficient, which is what this job needs: one
 * photograph or a short PDF per request, read once. Overridable through
 * `OPENAI_MODEL` precisely so that a model being retired, or an account
 * not being granted this one, is a dashboard change rather than a deploy
 * — `gpt-4.1-mini` is the drop-in if this name is not available to the
 * account (the route reports that case specifically).
 */
export const DEFAULT_PARCHA_MODEL = "gpt-5-mini";

/**
 * How long to wait for a reading before giving up.
 *
 * A multi-page PDF genuinely takes tens of seconds. This sits under the
 * route's own `maxDuration` so the timeout that fires is this one — which
 * produces a friendly message and an intact textarea — rather than the
 * platform killing the function and handing the browser a bare 504.
 */
const REQUEST_TIMEOUT_MS = 55_000;

/**
 * A cap on how much the model may write back, not on how much it reads.
 *
 * Generous on purpose: a reasoning model spends part of this budget
 * before emitting the first item, and a budget that runs out mid-list
 * returns a truncated reading that looks complete. `status: "incomplete"`
 * is treated as a failure below rather than parsed for what survived.
 */
const MAX_OUTPUT_TOKENS = 8_000;

/** Beyond this, the file is not a materials list. Bounds memory and the
    size of what gets pasted into the textarea; a real parcha is tens of
    lines, not hundreds. */
const MAX_ITEMS = 200;

/** ---- Errors ------------------------------------------------------------ */

export type ParchaReadFailure =
  /** No `OPENAI_API_KEY`. Not an error the customer caused. */
  | "not_configured"
  /** The file type cannot be sent to a model at all. */
  | "unsupported"
  /** The model answered, and found no materials in the file. */
  | "empty"
  /** The model answered with something that was not the agreed shape. */
  | "invalid_response"
  /** Upstream rate limit or spend cap. */
  | "rate_limited"
  | "timeout"
  /** Anything else upstream: auth, model access, 5xx. */
  | "upstream";

export class ParchaReadError extends Error {
  constructor(
    readonly reason: ParchaReadFailure,
    message: string,
  ) {
    super(message);
    this.name = "ParchaReadError";
  }
}

/**
 * What a failed read is recorded as.
 *
 * `ParchaReadError.message` carries the upstream text — OpenAI's 400s and
 * 429s quote organisation ids, project names and quota figures — and
 * `runExtraction` in `src/lib/data/parcha-submissions.ts` writes its note
 * onto `ParchaSubmission.extractionNote`, which `GET
 * /api/v1/parcha/submissions/{reference}` hands back to the customer. So
 * a reason maps to a sentence here, and the raw message never leaves a
 * server log.
 *
 * Written for the two people who read a stored submission — the customer
 * checking on it, and the staff member picking it up — which is why these
 * are not the same strings as `MESSAGE` in
 * `src/app/api/v1/parcha/extract/route.ts`. That route answers someone
 * standing in front of the workbench with a textarea in reach; this one
 * describes a submission already in a queue. Change both when the
 * behaviour changes.
 */
export const PARCHA_READ_NOTE: Record<ParchaReadFailure, string> = {
  not_configured:
    "Automatic reading is not switched on. A team member will open this file and enter the list by hand.",
  unsupported:
    "This file type cannot be read automatically. A team member will open it and enter the list by hand.",
  empty:
    "Nothing on this file could be read as a material. A team member will check it by hand.",
  invalid_response:
    "This file could not be read cleanly. A team member will check it by hand.",
  rate_limited:
    "Reading was rate-limited upstream. A team member will check this file by hand.",
  timeout:
    "This file took too long to read. A team member will check it by hand.",
  upstream:
    "This file could not be read automatically. A team member will check it by hand.",
};

/** ---- Configuration ----------------------------------------------------- */

/**
 * Whether a file can be read automatically at all.
 *
 * Checked before any bytes are touched, so an unconfigured deploy is
 * never the reason an upload *fails* — it is the reason the workbench
 * says a person will read the file instead, which is what
 * `decideExtractionAction` in `parcha-extract.ts` already routes.
 */
export function isParchaReaderConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

/** The model actually in use. Exported so the route can name it in a log
    line when an account turns out not to have access to it. */
export function parchaModel(): string {
  const configured = env.OPENAI_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_PARCHA_MODEL;
}

let cachedClient: OpenAI | null = null;

function client(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new ParchaReadError("not_configured", "OPENAI_API_KEY is not set");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      /* One retry, not the SDK's default two. A retry of a 55-second read
         cannot finish inside the function's lifetime, and a request that
         is retried into a platform timeout looks to the customer like a
         hang rather than a failure they can act on. */
      maxRetries: 1,
    });
  }
  return cachedClient;
}

/** ---- The prompt -------------------------------------------------------- */

const SYSTEM_PROMPT = `You are Quoin's construction-material document parser.

Read the COMPLETE uploaded document/image carefully.

The document may be:
- handwritten
- printed
- photographed
- scanned
- low quality
- partially rotated
- a construction-material purchase list/parcha
- an invoice or quotation containing construction materials

Extract EVERY construction-related product/material mentioned.

Do not summarize.
Do not skip items.
Do not invent products.
Do not guess quantities when they are not visible.

Normalize obvious OCR/spelling variations when the intended product is clear.

Preserve brand names when present.

For each item identify:
- item/product name
- quantity
- unit
- brand if present

Examples:
'Cement 40 bags'
'Steel 250 kg'
'White emulsion 18 ltr'
'Jaquar shower head'

Rules:
- Include every detected item, in the order they appear in the document.
- If quantity is missing, use null. Never substitute 1 for a missing quantity.
- If unit is missing, use null.
- If brand is missing, use null.
- Never fabricate missing information.
- Combine obvious duplicates only when they clearly refer to the same product.
- Keep product names concise and useful for a pricing/search system.
- Ignore unrelated handwriting, addresses, phone numbers, signatures, dates, totals and payment information unless they are necessary to identify the product.
- Pay special attention to Indian construction terminology, brands, units and abbreviations such as: kg, g, ton, bag, bags, nos, pcs, piece, litre, ltr, ft, sq ft, mm, inch, meter, mtr, box, set.
- Dimensions and sizes belong to the product name, not to the quantity. In "CPVC Pipe 1 inch 20 nos" the name is "CPVC Pipe 1 inch", the quantity is 20 and the unit is "nos".

If the document has more than one page, read every page from the first to
the last and extract items from all of them. Do not stop after the first
page and do not summarise later pages. A header, a column heading or a
company name repeated at the top of each page is not an item, and the
same product listed once per page because of such a repeat must appear
once — but two genuinely separate lines for the same material must both
be kept.

If the document contains no construction materials at all, or is too
unclear to read any item from with confidence, return an empty items
array rather than guessing.`;

const USER_INSTRUCTION =
  "Read this construction-material parcha completely, every page, and return every material on it.";

/**
 * The agreed shape of the answer, enforced by the API rather than hoped
 * for in prose. `strict` means the model cannot omit a key or add one, so
 * the validation below is a guard against a genuinely malformed response
 * rather than the primary defence.
 */
const RESPONSE_FORMAT = {
  type: "json_schema",
  name: "parcha_items",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "quantity", "unit", "brand"],
          properties: {
            name: { type: "string" },
            quantity: { type: ["number", "null"] },
            unit: { type: ["string", "null"] },
            brand: { type: ["string", "null"] },
          },
        },
      },
    },
  },
} as const;

/** ---- Output ------------------------------------------------------------ */

export interface ParchaExtractedItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  brand: string | null;
}

export interface ParchaReading {
  items: ParchaExtractedItem[];
  /** The same items rendered one per line, in the shape a customer would
      have typed them — which is what lands in the textarea and what
      `parseParcha` reads back. */
  text: string;
}

/** ---- Reading ----------------------------------------------------------- */

/** What a model can be shown. PDFs go as a file so every page is read;
    everything else goes as an image. HEIC is deliberately absent — OpenAI
    does not accept it, and the browser converts it before upload (see
    `prepareImageForUpload` in `src/lib/parcha-image.ts`). */
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Sends one file to the model and returns what it read.
 *
 * The bytes are inlined as a data URL rather than uploaded to the Files
 * API first. One round trip instead of two, nothing of the customer's is
 * left sitting in a third-party account after the request, and there is
 * no orphaned-file cleanup job to write and then forget to run.
 */
export async function readParchaFile(input: {
  buffer: Buffer;
  contentType: string;
  filename: string;
}): Promise<ParchaReading> {
  const contentType = input.contentType.toLowerCase().split(";")[0].trim();

  let content: OpenAI.Responses.ResponseInputContent;
  if (contentType === "application/pdf") {
    content = {
      type: "input_file",
      /* The API uses the extension here to decide how to handle the
         bytes, so it must end in .pdf whatever the customer's file was
         called. Not built from `originalName` — see `buildStorageKey` in
         src/lib/storage/index.ts for why attacker-controlled filenames
         never get to name anything. */
      filename: "parcha.pdf",
      file_data: `data:application/pdf;base64,${input.buffer.toString("base64")}`,
    };
  } else if (IMAGE_CONTENT_TYPES.has(contentType)) {
    content = {
      type: "input_image",
      image_url: `data:${contentType};base64,${input.buffer.toString("base64")}`,
      /* Handwriting on a photographed page is exactly the case the low
         setting loses: it downsamples to a thumbnail, and a thumbnail of
         a parcha is unreadable. */
      detail: "high",
    };
  } else {
    throw new ParchaReadError("unsupported", `Cannot read ${contentType}`);
  }

  let response: OpenAI.Responses.Response;
  try {
    response = await client().responses.create({
      model: parchaModel(),
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: USER_INSTRUCTION }, content],
        },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      /* No `temperature` and no `reasoning`, deliberately: both are
         rejected by one half or the other of the models this variable can
         point at, and a request that 400s the moment someone changes
         `OPENAI_MODEL` defeats the point of the variable. */
      text: { format: RESPONSE_FORMAT },
    });
  } catch (error) {
    throw asReadError(error);
  }

  /* Budget exhausted mid-list. The partial output would parse cleanly and
     read as a complete list that is quietly missing its last items, which
     is the one failure mode worth refusing outright. */
  if (response.status === "incomplete") {
    throw new ParchaReadError(
      "invalid_response",
      `Response incomplete: ${response.incomplete_details?.reason ?? "unknown"}`,
    );
  }

  const items = parseItems(response.output_text);
  if (items.length === 0) {
    throw new ParchaReadError("empty", "No materials found in the document");
  }

  return { items, text: items.map(formatItemLine).join("\n") };
}

/** ---- Validation -------------------------------------------------------- */

/**
 * Reads the model's JSON without trusting any of it.
 *
 * Written by hand rather than with Zod, because "invalid" and "empty" are
 * different answers here and each field is salvageable on its own: a row
 * with an unreadable quantity is still a real material, and dropping the
 * whole reading over it would lose items the model genuinely found. Only
 * a body that is not the agreed shape at all is a failure.
 */
export function parseItems(raw: string): ParchaExtractedItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ParchaReadError("invalid_response", "Model did not return JSON");
  }

  if (typeof parsed !== "object" || parsed === null || !("items" in parsed)) {
    throw new ParchaReadError("invalid_response", "Model JSON had no items array");
  }

  const rawItems = (parsed as { items: unknown }).items;
  if (!Array.isArray(rawItems)) {
    throw new ParchaReadError("invalid_response", "Model JSON items was not an array");
  }

  const items: ParchaExtractedItem[] = [];
  for (const entry of rawItems.slice(0, MAX_ITEMS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;

    const name = cleanText(row.name);
    /* An item with no name is not an item. Nothing else is required. */
    if (!name) continue;

    items.push({
      name,
      quantity: cleanQuantity(row.quantity),
      unit: cleanText(row.unit),
      brand: cleanText(row.brand),
    });
  }

  return items;
}

/**
 * One field of the model's answer, made safe to put in a textarea.
 *
 * Newlines, commas and semicolons are stripped rather than escaped:
 * `parseParcha` splits on all three, so a product name containing one
 * would silently become two items with two prices.
 */
function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\r\n,;]+/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text.slice(0, 160) : null;
}

function cleanQuantity(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  /* Two decimal places is as fine as a materials list is ever written —
     "12.5 kg", not "12.4999999". */
  return Math.round(n * 100) / 100;
}

/** ---- Rendering back to a typed line ------------------------------------ */

/**
 * Units, spelled the way `parseParcha` reads them.
 *
 * The model writes what the paper says — "sq ft", "Nos.", "litres" — and
 * `parseParcha`'s own table keys on single tokens, so a unit with a space
 * in it makes the parser miss the quantity entirely ("Floor Tiles 620 sq
 * ft" reads as one un-quantified item). Mapping here rather than widening
 * that table keeps the parser's contract with *typed* input unchanged:
 * this is a rendering concern, not a parsing one.
 *
 * A unit that is not in this table is written through untouched. It is
 * still the customer's own words on screen, and they can edit it.
 */
const UNIT_TOKEN: Record<string, string> = {
  bag: "bags",
  bags: "bags",
  bori: "bags",
  boris: "bags",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ton: "tonnes",
  tons: "tonnes",
  tonne: "tonnes",
  tonnes: "tonnes",
  mt: "tonnes",
  l: "ltr",
  ltr: "ltr",
  ltrs: "ltr",
  litre: "ltr",
  litres: "ltr",
  liter: "ltr",
  liters: "ltr",
  sqft: "sqft",
  "sq ft": "sqft",
  "sq.ft": "sqft",
  "sq. ft": "sqft",
  "sq feet": "sqft",
  "square feet": "sqft",
  "square foot": "sqft",
  sft: "sqft",
  sqm: "sqm",
  "sq m": "sqm",
  "sq.m": "sqm",
  "square metre": "sqm",
  "square meter": "sqm",
  "square metres": "sqm",
  "square meters": "sqm",
  rft: "rft",
  "running ft": "rft",
  "running feet": "rft",
  "r ft": "rft",
  ft: "ft",
  feet: "ft",
  foot: "ft",
  m: "mtr",
  mtr: "mtr",
  mtrs: "mtr",
  meter: "mtr",
  meters: "mtr",
  metre: "mtr",
  metres: "mtr",
  no: "nos",
  nos: "nos",
  num: "nos",
  pc: "nos",
  pcs: "nos",
  piece: "nos",
  pieces: "nos",
  unit: "nos",
  units: "nos",
  box: "box",
  boxes: "box",
  set: "set",
  sets: "set",
  roll: "roll",
  rolls: "roll",
  sheet: "sheet",
  sheets: "sheet",
  bundle: "bundle",
  bundles: "bundle",
};

/** Normalises a unit as the model wrote it to a token `parseParcha`
    recognises, or returns it unchanged when there is no equivalent. */
export function unitToken(unit: string): string {
  const key = unit.toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ").trim();
  return UNIT_TOKEN[key] ?? unit.trim();
}

/**
 * Renders one extracted item as a line someone could have typed.
 *
 * Brand first, then name, then quantity and unit — "Asian Paints White
 * Emulsion 18 ltr" — because that is both how a parcha is written and the
 * order `parseParcha` reads best: it takes a trailing quantity, leaving
 * the whole of the rest as the search term.
 *
 * The brand is prefixed only when the name does not already carry it, so
 * a model that answers `{ name: "Jaquar Shower Head", brand: "Jaquar" }`
 * does not produce "Jaquar Jaquar Shower Head".
 *
 * A missing quantity stays missing. Writing "1" for an item whose
 * quantity was not on the paper would be inventing a number, and
 * `parseParcha` already defaults an un-quantified line to 1 at the point
 * where that default is visible and editable.
 */
export function formatItemLine(item: ParchaExtractedItem): string {
  const name = item.name.trim();
  const brand = item.brand?.trim() ?? "";

  const words = name.toLowerCase();
  const head = brand && !words.includes(brand.toLowerCase()) ? `${brand} ` : "";

  let line = `${head}${name}`.replace(/\s+/g, " ").trim();

  if (item.quantity != null) {
    line += ` ${item.quantity}`;
    if (item.unit) line += ` ${unitToken(item.unit)}`;
  }

  return line;
}

/** ---- Upstream failures ------------------------------------------------- */

/**
 * Turns whatever the SDK threw into one of this module's reasons.
 *
 * The upstream message is kept on the `ParchaReadError` for the route to
 * log and is never the message a customer sees — OpenAI's 400s and 401s
 * quote organisation ids, project names and quota figures, none of which
 * belongs in a storefront error.
 */
function asReadError(error: unknown): ParchaReadError {
  if (error instanceof ParchaReadError) return error;

  if (error instanceof OpenAI.APIUserAbortError) {
    return new ParchaReadError("timeout", "Request aborted");
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new ParchaReadError("timeout", "Upstream timed out");
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new ParchaReadError("upstream", "Could not reach the upstream API");
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return new ParchaReadError("rate_limited", `Upstream 429: ${error.message}`);
    }
    return new ParchaReadError("upstream", `Upstream ${error.status ?? "error"}: ${error.message}`);
  }

  return new ParchaReadError("upstream", error instanceof Error ? error.message : "Unknown error");
}
