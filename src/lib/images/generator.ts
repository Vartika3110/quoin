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
        size: "1024x1024",
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
