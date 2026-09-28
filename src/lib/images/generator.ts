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

/**
 * How a unit of the thing is presented.
 *
 * Each entry describes a *form* only — the category says what the thing
 * is. Two rules learned from looking at what came back:
 *
 *  - Nothing here may mention a label, a printed volume or a marking.
 *    The prompt ends by forbidding text and packaging labels, and a hint
 *    that asks for one anyway leaves the model to pick a winner. It
 *    picks text, and invented text on a product shot is the defect this
 *    pipeline can least afford.
 *  - "A sealed sack" is not enough to get a builder's sack; it gets a
 *    cushion. Naming the material and the stance costs nothing and is
 *    the difference between cement and a pillow.
 */
const UNIT_HINT: Record<string, string> = {
  per_litre: "shown as a sealed metal tin with a wire handle, unprinted",
  per_bag:
    "shown as one full sack standing upright, woven polypropylene or heavy paper, unprinted",
  per_kg: "shown as one sealed tub or sack of the material, unprinted",
  per_sqft: "shown as a flat sheet or slab, seen at a slight angle",
  per_running_ft: "shown as a length of material",
  per_visit: "shown as a person at work, no packaging",
};

/**
 * The product name with its pack size taken off the end.
 *
 * `Adani ACC Suraksha Power PPC Cement, 50 kg` handed to the model whole
 * comes back as a sack with "50 kg" lettered across it, because the
 * subject line asked for a quantity and the model can only draw one by
 * writing it. The size belongs on the product page, not painted on the
 * bag — and the prompt already forbids text, so this is the same
 * instruction enforced where it can actually be obeyed.
 *
 * Only a trailing fragment is removed, and only one that is entirely a
 * measurement: `Ball Valve 25mm` keeps its bore, because that is the
 * product rather than the packing.
 */
const PACK_SIZE =
  /,\s*(?:[\d.,]+\s*(?:kg|kgs|gm|gms|g|ltr|litres?|liters?|l|ml|pcs?|nos?|sets?|pairs?)|[\d.']+\s*[x×]\s*[\d.']+\s*(?:ft|feet|mm|cm|m|in|inch)?)\s*(?:bags?|packs?|packets?|tins?|cans?|boxes|box|jars?|rolls?|bottles?|pouches?|sacks?|drums?|buckets?|pails?)?\s*\.?$/i;

export function subjectOf(name: string): string {
  return name.replace(PACK_SIZE, "").trim().replace(/[,\s]+$/, "");
}

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
  /* Lower-cased because Prisma hands back the enum as written in the
     schema — `PER_KG`, not `per_kg`. Keyed directly, this lookup missed
     on every product ever generated and the unit hint silently never
     reached a prompt. A miss looks exactly like "this unit has no hint",
     which is why it went unnoticed. */
  const unit = UNIT_HINT[product.pricingUnit.toLowerCase()];
  const subject = subjectOf(product.name).toLowerCase();

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
 * A request, retried while the failure is one that says "try again".
 *
 * Two kinds of setback are not failed generations, and the difference
 * matters because the batch job counts failures and gives up at ten:
 *
 *  - **429.** The provider is saying "slower" and usually says for how
 *    long. A new organisation's ceiling is low — five images a minute at
 *    the time of writing. Nothing was produced and nothing was charged.
 *  - **A thrown fetch.** DNS, a dropped socket, a proxy hiccup. Over a
 *    run of several hours across thousands of requests these are certain
 *    rather than unlikely, and eight of them in a row ended a run that
 *    had 1,128 products still to go.
 *
 * Both are transport, not rejection. A refusal, a bad key or a malformed
 * prompt still comes straight back to the caller — retrying those would
 * just be slower failure.
 *
 * The wait comes from the provider when it offers one — `Retry-After`,
 * or the "try again in 12s" in the message — because a guess is either
 * wasteful or too eager. Otherwise it backs off exponentially.
 */
async function fetchRetryingRateLimits(
  url: string,
  init: RequestInit,
  attempts = 6,
): Promise<Response> {
  const pause = (seconds: number) =>
    new Promise((r) => setTimeout(r, (seconds + 1) * 1000));
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const last = attempt === attempts - 1;
    let res: Response;

    try {
      res = await fetch(url, init);
    } catch (e) {
      lastNetworkError = e;
      if (last) break;
      const seconds = Math.min(60, 2 ** attempt * 3);
      console.info(`  network error, retrying in ${seconds}s (${attempt + 1}/${attempts})`);
      await pause(seconds);
      continue;
    }

    if (res.status !== 429 || last) return res;

    const body = await res.clone().text();
    const hinted = Number(/try again in ([\d.]+)\s*s/i.exec(body)?.[1]);
    const header = Number(res.headers.get("retry-after"));
    const seconds = hinted || header || Math.min(60, 2 ** attempt * 5);
    console.info(`  rate-limited, waiting ${seconds}s (${attempt + 1}/${attempts})`);
    await pause(seconds);
  }

  throw lastNetworkError ?? new Error("Image provider unreachable after retries");
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
    const res = await fetchRetryingRateLimits(
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
    const res = await fetchRetryingRateLimits("https://api.openai.com/v1/images/generations", {
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

/**
 * Whichever provider this machine is actually funded for, cheapest first.
 *
 * Lifted here out of `scripts/generate-studio-images.ts` so the catalogue
 * job gets the same choice. It used to construct `OpenAiImageGenerator`
 * directly, which meant a four-figure run billed whichever provider the
 * script happened to name — a default nobody chose and nothing announced.
 *
 * **Which provider is cheaper depends on the shape, and the two jobs
 * disagree.** Measured September 2026, per image:
 *
 *   - catalogue tile, square 1024 at `low` — OpenAI $0.011
 *     (`gpt-image-1-mini` $0.005) against Gemini 1K $0.067. OpenAI wins,
 *     by roughly six times.
 *   - Studio room, portrait 1024x1536 at `medium` — OpenAI's price climbs
 *     steeply with quality and pixels, where Gemini's 1K rate does not.
 *     Gemini wins, by roughly three.
 *
 * So `cheapest` is the caller's to state: there is no provider that is
 * simply dearer, and hardcoding one costs real money in one direction or
 * the other. `preferred` — `--provider` at the command line — overrides
 * it. A key that is missing for the provider the caller asked for falls
 * back to the other, because one funded account is the common case; a
 * `--provider` the human typed does not fall back, because silently
 * billing the other account is not a kindness. Neither key set is a
 * configuration error, not a silent no-op, and a misspelt `--provider`
 * says so too — that typo is otherwise discovered on the invoice.
 */
export function liveGenerator({
  size,
  aspectRatio,
  cheapest,
  quality = "low",
  preferred,
  openaiModel = "gpt-image-1",
  geminiModel,
}: {
  /** OpenAI's fixed sizes. */
  size: "1024x1024" | "1024x1536" | "1536x1024";
  /** The same shape as Gemini names it: `1:1`, `3:4`, `4:3`. */
  aspectRatio: string;
  /** Which provider is cheaper at this shape and quality. See above. */
  cheapest: "openai" | "gemini";
  /** OpenAI only — Gemini has no equivalent knob, and it drives the price. */
  quality?: "low" | "medium" | "high";
  /** `openai` or `gemini`, to force one when both are funded. */
  preferred?: string;
  /** `gpt-image-1-mini` is about half the price at `low`. */
  openaiModel?: string;
  /** `gemini-3.1-flash-lite-image` is about half the price of the default. */
  geminiModel?: string;
}): ImageGenerator {
  if (preferred && preferred !== "openai" && preferred !== "gemini") {
    throw new Error(`--provider must be "openai" or "gemini", not "${preferred}"`);
  }

  const gemini = process.env.GEMINI_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();

  const makeOpenAi = () => new OpenAiImageGenerator(openai!, openaiModel, quality, size);
  const makeGemini = () => new GeminiImageGenerator(gemini!, geminiModel, aspectRatio);

  /* An explicit --provider is obeyed or refused, never quietly redirected
     to the other account. */
  if (preferred === "openai") {
    if (!openai) throw new Error("--provider openai, but OPENAI_API_KEY is not set in .env.local");
    return makeOpenAi();
  }
  if (preferred === "gemini") {
    if (!gemini) throw new Error("--provider gemini, but GEMINI_API_KEY is not set in .env.local");
    return makeGemini();
  }

  if (cheapest === "openai" && openai) return makeOpenAi();
  if (cheapest === "gemini" && gemini) return makeGemini();

  if (openai) return makeOpenAi();
  if (gemini) return makeGemini();

  throw new Error(
    "No image provider key found. Add OPENAI_API_KEY (or GEMINI_API_KEY) to .env.local.",
  );
}
