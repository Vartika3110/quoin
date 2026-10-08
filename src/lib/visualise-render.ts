import OpenAI, { toFile } from "openai";
import { env } from "@/lib/env";

/**
 * The optional "make it photo-realistic" step of "See it in your space".
 *
 * Everything else in the visualiser runs in the browser and never uploads
 * anything. This is the one exception, and it is opt-in: the customer
 * presses a button that says their photograph will be sent to an AI
 * service, and only then does this module run. The image model redraws
 * the customer's own photograph with the product in it; it is a picture
 * of an idea, labelled as AI-generated wherever it is shown, and it can
 * be wrong about a texture or a proportion.
 *
 * Same guarantees as `photo-search-openai.ts`: the key never leaves the
 * server, a failure is a failure rather than a plausible guess, and no
 * upstream message reaches the customer. Nothing is stored — the bytes
 * live for the length of the request.
 */

export const IMAGE_MODEL = "gpt-image-1";
const REQUEST_TIMEOUT_MS = 100_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type RenderFailure = "not_configured" | "unsupported" | "invalid_response" | "rate_limited" | "timeout" | "upstream";

export class RenderError extends Error {
  constructor(
    readonly reason: RenderFailure,
    message: string,
  ) {
    super(message);
    this.name = "RenderError";
  }
}

export interface RenderSpec {
  kind: "tile" | "paint" | "door" | "object";
  surface: "floor" | "wall" | "door";
  /** The product's title: context for the model, never shown as a claim. */
  title: string;
  tileMm?: [number, number];
  /** Paint: the colour the customer picked. */
  colourName?: string;
  colourHex?: string;
  /** Object: roughly where it should go, as fractions of the picture. */
  at?: { x: number; y: number };
  widthCm?: number;
}

export function isRenderConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

/** The instruction the model is given. Pure, so it can be tested. */
export function buildRenderPrompt(spec: RenderSpec): string {
  const keep =
    "Keep every piece of furniture, object, shadow, reflection, the lighting and everything else in the photograph exactly as it is. Do not add people, text or logos.";
  const title = spec.title.replace(/["\n\r]+/g, " ").slice(0, 120);

  if (spec.kind === "paint") {
    const colour = spec.colourName ? `${spec.colourName} (${spec.colourHex ?? ""})` : spec.colourHex ?? "the chosen colour";
    return `Photo-realistically repaint the main wall in this room photograph in ${colour.trim()}, with a smooth matte finish. ${keep} Change nothing except the wall's colour.`;
  }
  if (spec.kind === "tile") {
    const size = spec.tileMm ? `, ${spec.tileMm[0]} x ${spec.tileMm[1]} mm each` : "";
    const surface = spec.surface === "wall" ? "main wall" : "floor";
    return `Photo-realistically lay "${title}" tiles${size} on the ${surface} of this room photograph, in a standard grid with thin grout lines, at true tile scale and in correct perspective. The second image shows one tile. ${keep} Change nothing except the ${surface}.`;
  }
  if (spec.kind === "door") {
    return `Photo-realistically replace the existing door, or the empty doorway, in this photograph with the door shown in the second image ("${title}"). Fit it exactly into the existing opening with a matching frame, in correct perspective, with a natural handle side and the same lighting and shadows as the room. ${keep} Change nothing except the door.`;
  }
  const where = spec.at ? ` Place it around ${Math.round(spec.at.x * 100)}% from the left and ${Math.round(spec.at.y * 100)}% from the top of the picture.` : "";
  const size = spec.widthCm ? `, about ${Math.round(spec.widthCm)} cm wide` : "";
  return `Add the product shown in the second image ("${title}"${size}) into this room photograph so it looks naturally placed or installed there, at a realistic size, with matching perspective, lighting and soft shadows.${where} ${keep}`;
}

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (!env.OPENAI_API_KEY) throw new RenderError("not_configured", "OPENAI_API_KEY is not set");
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  }
  return cachedClient;
}

function typeOf(contentType: string): string {
  return contentType.toLowerCase().split(";")[0].trim();
}

/** Redraws the room with the product in it. Returns a PNG as base64. */
export async function renderInRoom(input: {
  room: { buffer: Buffer; contentType: string };
  product?: { buffer: Buffer; contentType: string } | null;
  spec: RenderSpec;
}): Promise<string> {
  const roomType = typeOf(input.room.contentType);
  if (!IMAGE_TYPES.has(roomType)) throw new RenderError("unsupported", `Cannot read ${roomType}`);

  const files = [await toFile(input.room.buffer, "room", { type: roomType })];
  if (input.product && input.spec.kind !== "paint") {
    const productType = typeOf(input.product.contentType);
    if (IMAGE_TYPES.has(productType)) files.push(await toFile(input.product.buffer, "product", { type: productType }));
  }

  let response: OpenAI.Images.ImagesResponse;
  try {
    response = await client().images.edit({
      model: IMAGE_MODEL,
      image: files,
      prompt: buildRenderPrompt(input.spec),
      size: "auto",
      quality: "medium",
      n: 1,
    });
  } catch (error) {
    throw asError(error);
  }
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new RenderError("invalid_response", "No image returned");
  return b64;
}

function asError(error: unknown): RenderError {
  if (error instanceof RenderError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new RenderError("timeout", error.message);
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return new RenderError("rate_limited", error.message);
    return new RenderError("upstream", `${error.status ?? ""} ${error.message}`.trim());
  }
  return new RenderError("upstream", error instanceof Error ? error.message : String(error));
}

/** Parses the `spec` field of the request without trusting any of it. */
export function parseSpec(raw: unknown): RenderSpec | null {
  if (typeof raw !== "string" || raw.length > 2_000) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const kinds = ["tile", "paint", "door", "object"] as const;
  const surfaces = ["floor", "wall", "door"] as const;
  const kind = kinds.find((k) => k === o.kind);
  const surface = surfaces.find((s) => s === o.surface);
  if (!kind || !surface || typeof o.title !== "string") return null;

  const num = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? x : undefined);
  const spec: RenderSpec = { kind, surface, title: o.title.slice(0, 160) };
  if (Array.isArray(o.tileMm) && o.tileMm.length === 2) {
    const a = num(o.tileMm[0], 50, 3000);
    const b = num(o.tileMm[1], 50, 3000);
    if (a && b) spec.tileMm = [a, b];
  }
  if (typeof o.colourName === "string") spec.colourName = o.colourName.replace(/[^\p{L}\p{N} '-]/gu, "").slice(0, 40);
  if (typeof o.colourHex === "string" && /^#[0-9a-f]{6}$/i.test(o.colourHex)) spec.colourHex = o.colourHex;
  if (typeof o.at === "object" && o.at !== null) {
    const at = o.at as Record<string, unknown>;
    const x = num(at.x, 0, 1);
    const y = num(at.y, 0, 1);
    if (x !== undefined && y !== undefined) spec.at = { x, y };
  }
  const w = num(o.widthCm, 1, 1000);
  if (w) spec.widthCm = w;
  return spec;
}
