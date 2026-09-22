/**
 * Product image generation.
 *
 * Behind an interface so the batch job never knows which provider is in
 * play, the same way `auth/sender.ts` hides the SMS gateway. Anthropic
 * has no image model, so this is necessarily a third-party call; swapping
 * OpenAI for Replicate or Google is one class here and no change anywhere
 * else.
 *
 * What comes out of these models is an *illustration of a category*, not
 * a photograph of the SKU a customer will receive. Everything written by
 * this pipeline is flagged `imageIsGenerated`, and the storefront labels
 * it. Removing that label is the difference between an illustrated
 * catalogue and a misleading one.
 */

export interface GeneratedImage {
  /** Raw image bytes, whatever format the provider returned. */
  data: Buffer;
  /** File extension without the dot, e.g. `png` or `webp`. */
  extension: string;
}

export interface ImageGenerator {
  readonly name: string;
  generate(prompt: string): Promise<GeneratedImage>;
}

/** What the model is asked to draw. */
export interface ProductBrief {
  name: string;
  brand: string | null;
  category: string | null;
  /** e.g. `per_litre` — a paint tin looks nothing like a paint roller. */
  pricingUnit: string;
}

/**
 * Category framing.
 *
 * Product names in this catalogue are terse and ambiguous out of context
 * — "Bend", "Chakka", "Tee Cover" describe themselves to a plumber and to
 * nobody else. The category is what stops the model drawing a road bend
 * for a pipe fitting.
 */
const CATEGORY_HINT: Record<string, string> = {
  "Bathware & plumbing": "bathroom fitting or plumbing component, chrome or PVC",
  "Kitchen sinks & faucets": "kitchen sink or tap, stainless steel or chrome",
  "Electricals & lighting": "electrical fitting, wiring accessory or light fitting",
  "Home appliances & security": "household appliance or security device",
  "Hardware & locks": "builder's hardware, lock or metal fitting",
  "Kitchen & wardrobe fittings": "cabinet or wardrobe fitting, hinge, runner or pull-out",
  "Tools & safety": "hand tool, power tool or safety equipment",
  "Tiling & adhesives": "tile, tile adhesive or grout packaging",
  "Paints & finishes": "paint tin or wood finish container",
  "Cement & steel": "construction material, cement bag or steel reinforcement",
  "Plywood & laminates": "plywood sheet, laminate or board material",
  Waterproofing: "waterproofing compound container or membrane roll",
  "Gypsum & false ceiling": "gypsum board or ceiling section",
  Services: "professional tradesperson at work on a building site",
};

const UNIT_HINT: Record<string, string> = {
  per_litre: "shown as a sealed container with its volume on the label",
  per_bag: "shown as a sealed sack",
  per_kg: "shown as a packaged quantity",
  per_sqft: "shown as a flat sheet or slab, seen at a slight angle",
  per_running_ft: "shown as a length of material",
  per_visit: "shown as a person at work, no packaging",
};

/**
 * A prompt describing the *kind* of thing, never a specific model number.
 *
 * The brand is deliberately withheld. Asking for "a Jaquar CON-CHR-047"
 * invites the model to invent branding and a form factor it has no
 * knowledge of, producing something that looks like a real product
 * photograph and is wrong in every detail — which is precisely the
 * failure mode that makes generated catalogue imagery risky.
 */
/** "a electrical fitting" reads as a typo to a model as much as to a reader. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun.trim()) ? "an" : "a";
}

export function buildPrompt(product: ProductBrief): string {
  const category = product.category ? CATEGORY_HINT[product.category] : undefined;
  const unit = UNIT_HINT[product.pricingUnit];
  const subject = product.name.toLowerCase();

  return [
    `Product photograph of ${article(subject)} ${subject}`,
    category
      ? ` — ${article(category)} ${category}`
      : " — a building or interior product",
    unit ? `, ${unit}` : "",
    ". Centred on a plain white background, soft even studio lighting,",
    " no text, no logos, no branding, no watermark, no people,",
    " no packaging labels, photorealistic, square composition.",
  ]
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Google's image models, as an alternative provider.
 *
 * Here because the OpenAI account funding this ran dry and a Gemini key
 * was the one to hand — not because either provider is better. Both
 * satisfy the same one-method interface, so the scripts never learn which
 * one made a picture.
 *
 * Two things the REST shape gets right for Studio and OpenAI's does not:
 * `aspect_ratio` is a first-class parameter (so 3:4 portrait costs nothing
 * extra to ask for), and 1K images are about a third of the price.
 *
 * `image_size` is case-sensitive at the far end — "1k" is rejected, "1K"
 * is not — which is the kind of detail worth a comment because the error
 * it produces says nothing about capitalisation.
 */
export class GeminiImageGenerator implements ImageGenerator {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model = "gemini-3.1-flash-image",
    /** Portrait for Studio's wall of tiles. See `aspect_ratio` values in
        Google's docs: 1:1, 3:4, 4:3, 9:16 and the rest. */
    private readonly aspectRatio = "3:4",
    private readonly imageSize: "1K" | "2K" | "4K" = "1K",
  ) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required to generate images");
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: this.model,
          input: [{ type: "text", text: prompt }],
          response_format: {
            type: "image",
            aspect_ratio: this.aspectRatio,
            image_size: this.imageSize,
          },
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Image provider returned ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as GeminiResponse;
    const data = firstImageData(body);

    if (!data) {
      /* Named rather than swallowed: a 200 with no image is a refusal —
         a prompt the safety filter declined — and it must not be mistaken
         for a network fault the caller should retry. */
      throw new Error("Image provider returned no image for this prompt");
    }

    return { data: Buffer.from(data, "base64"), extension: "png" };
  }
}

/* Both response shapes are read, because an account may still be served
   the 2.5-era `candidates[]` envelope while the docs describe `steps[]`,
   and a picture is a picture either way. */
interface GeminiContentBlock {
  type?: string;
  data?: string;
  mime_type?: string;
}

interface GeminiResponse {
  steps?: { type?: string; content?: GeminiContentBlock[] }[];
  candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
}

function firstImageData(body: GeminiResponse): string | undefined {
  for (const step of body.steps ?? []) {
    for (const block of step.content ?? []) {
      if (block.data) return block.data;
    }
  }

  for (const candidate of body.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) return part.inlineData.data;
    }
  }

  return undefined;
}

/**
 * Prints the prompt and returns a placeholder instead of calling anyone.
 *
 * Lets the whole pipeline — querying, prompting, naming, writing back —
 * be exercised and reviewed before a single paid request is made, and
 * before any API key exists.
 */
export class DryRunGenerator implements ImageGenerator {
  readonly name = "dry-run";

  async generate(prompt: string): Promise<GeneratedImage> {
    console.info(`  prompt: ${prompt}`);
    return { data: Buffer.alloc(0), extension: "png" };
  }
}

/**
 * OpenAI's image endpoint.
 *
 * Raw fetch rather than a new dependency: this is one POST, and the batch
 * job is the only caller. `OPENAI_API_KEY` is read at construction so a
 * missing key fails before the first product rather than on the last.
 */
export class OpenAiImageGenerator implements ImageGenerator {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-image-1",
    /** `low` is the right default here: these are 400px catalogue tiles. */
    private readonly quality: "low" | "medium" | "high" = "low",
    /** Square by default, because a catalogue tile is square. Studio asks
        for portrait — a feed of tall tiles is a wall, a feed of squares is
        a grid — see `scripts/generate-studio-images.ts`. */
    private readonly size: "1024x1024" | "1024x1536" | "1536x1024" = "1024x1024",
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required to generate images");
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        n: 1,
        size: this.size,
        quality: this.quality,
      }),
    });

    if (!res.ok) {
      throw new Error(`Image provider returned ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = body.data?.[0];

    if (first?.b64_json) {
      return { data: Buffer.from(first.b64_json, "base64"), extension: "png" };
    }

    /* Some models return a URL with a short expiry instead of bytes. */
    if (first?.url) {
      const img = await fetch(first.url);
      if (!img.ok) throw new Error(`Could not download image: ${img.status}`);
      return { data: Buffer.from(await img.arrayBuffer()), extension: "png" };
    }

    throw new Error("Image provider returned no image");
  }
}
