import { ApiError, handler, ok } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import { callerIp, hashIp } from "@/lib/data/parcha-submissions";
import { enforceKeyed } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/env";
import { AiError, isAiConfigured } from "@/lib/ai/client";
import { canVisualise } from "@/lib/ai/eligibility";
import {
  isPlacement,
  isVisualisableContentType,
  MAX_NOTE_CHARS,
  orientationOf,
  renderInRoom,
  VISUAL_DISCLAIMER,
} from "@/lib/ai/visualise";
import { db } from "@/lib/db";
import { FULFILMENT, PRICING_UNIT, resolvePhoto } from "@/lib/data/catalog";

/**
 * POST /api/v1/visualise
 *
 * Renders one product into a photograph of the customer's own room and
 * answers with the image inline.
 *
 * **Nothing is stored, at either end.** The room photograph exists for
 * the length of one request and the render is returned as a data URL
 * rather than written to a bucket. That is a deliberate choice and not a
 * missing feature: a customer pointing a camera at their own bathroom has
 * not asked Quoin to keep a picture of their house, and the comparison
 * this feature exists for — three tiles against one photograph, decide —
 * happens inside a single session. Persisting a render means a storage
 * write, a retention policy and a deletion path for photographs of
 * people's homes; it is worth building when somebody wants to come back
 * to a render tomorrow, and not before.
 *
 * The practical consequence is that the response is large — a WEBP as
 * base64 — which is why the renderer asks for `medium` quality and WEBP
 * rather than a high-quality PNG.
 *
 * **The key never reaches the browser**, and nothing upstream is echoed
 * to the customer. See the note at the top of `src/lib/ai/client.ts`.
 */

export const runtime = "nodejs";

/* An image edit at `medium` takes 20-40 seconds. The client's own
   timeout sits under this so the failure a customer sees is this app's
   sentence rather than the platform's bare 504. */
export const maxDuration = 90;

/** The same 10MB the client shows. A client check is a courtesy; this is
    the rule. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Customer-facing failure text, one sentence per reason. None of them
    quote the upstream error, and all of them leave the product page
    usable — the render is an aid to a decision, not the decision. */
const MESSAGE: Record<string, string> = {
  not_configured:
    "Room previews are not switched on yet. The product photos and specifications on this page are unaffected.",
  unsupported: "We cannot read that kind of photo. Try a JPG, PNG or WEBP.",
  empty:
    "We could not produce a preview from that photo. Try one taken straight on, in daylight, with fewer people in frame.",
  invalid_response: "That preview did not come out. Try once more.",
  rate_limited: "We are rendering a lot of previews just now. Wait a minute and try again.",
  timeout: "That preview took too long. Try a photo of a single wall or floor area.",
  upstream: "We could not produce a preview just now. Try again in a moment.",
};

export const POST = handler(async (request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new ApiError("bad_request", "Send the photo as multipart/form-data");
  }

  /* Checked before the body is read: an unconfigured deploy should say so
     rather than accept a 10MB upload it cannot use. */
  if (!isAiConfigured()) {
    throw new ApiError("conflict", MESSAGE.not_configured);
  }

  const session = await getSession();
  const key = session ? `u:${session.userId}` : `ip:${hashIp(callerIp(request.headers))}`;
  /* The tightest of the three AI buckets, because this is the only one
     that costs cents rather than fractions of one — see `rate-limit.ts`. */
  enforceKeyed(
    "aiVisualise",
    key,
    (seconds) =>
      `You have rendered several previews in the last hour. Try again in ${Math.ceil(seconds / 60)} minutes.`,
  );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(
      "bad_request",
      "We could not receive that photo. It may be too large — try a smaller one.",
    );
  }

  const file = form.get("room");
  if (!(file instanceof File)) {
    throw new ApiError("bad_request", "Attach a photo of the room.");
  }
  if (file.size === 0) {
    throw new ApiError("bad_request", "That photo is empty. Try taking it again.");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(
      "bad_request",
      `That photo is larger than ${MAX_BYTES / 1024 / 1024}MB. Try a smaller one.`,
    );
  }
  if (!isVisualisableContentType(file.type)) {
    throw new ApiError("bad_request", MESSAGE.unsupported);
  }

  const slug = String(form.get("slug") ?? "").trim();
  if (!slug) throw new ApiError("bad_request", "Which product should we place?");

  const placement = String(form.get("placement") ?? "");
  if (!isPlacement(placement)) {
    throw new ApiError("bad_request", "Pick where the product should go.");
  }

  const note = String(form.get("note") ?? "")
    .trim()
    .slice(0, MAX_NOTE_CHARS);

  /* The room's shape, measured by the browser that re-encoded the file.
     Absent or nonsense falls through to square — see `orientationOf`. */
  const orientation = orientationOf(
    Number(form.get("width")),
    Number(form.get("height")),
  );

  /* A narrow read rather than `getProductBySlug`: this needs the raw
     image columns and the category slug, and none of the variant and
     pricing hydration the storefront type carries. */
  const product = await db.product.findFirst({
    where: { slug, isActive: true, variants: { some: { isActive: true } } },
    select: {
      name: true,
      fulfilment: true,
      pricingUnit: true,
      image: true,
      imageIsGenerated: true,
      sourceImageUrl: true,
      brand: { select: { name: true } },
      category: { select: { slug: true, name: true } },
    },
  });
  if (!product) throw new ApiError("not_found", "We could not find that product.");

  /* The same gate the product page uses to decide whether to show the
     button at all — one rule, two callers. See `src/lib/ai/eligibility.ts`
     for why services are excluded. */
  const eligible = canVisualise(
    {
      /* Through the catalogue's own mappers rather than compared against
         the Prisma spelling here: one translation between the schema's
         SCREAMING_SNAKE and the storefront's snake_case, in the module
         that owns it. */
      fulfilment: FULFILMENT[product.fulfilment],
      pricingUnit: PRICING_UNIT[product.pricingUnit],
    },
    product.category?.slug ?? null,
  );
  if (!eligible) {
    throw new ApiError(
      "conflict",
      "A room preview only makes sense for something physical. This is a service — book a site visit instead and an expert will advise on the spot.",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  /* Quoin's own photograph, when there is a real one, so the render shows
     *that* product rather than the model's idea of the category. An
     illustration is deliberately not used as a reference: it is already
     a model's guess, and feeding one guess into another compounds the
     invention rather than grounding it. */
  const photoUrl = product.imageIsGenerated ? null : resolvePhoto(product);
  const productPhoto = photoUrl ? await fetchPhoto(photoUrl) : null;

  let render;
  try {
    render = await renderInRoom({
      room: { buffer, contentType: file.type },
      productPhoto,
      product: {
        title: product.name,
        brand: product.brand?.name ?? null,
        category: product.category?.name ?? null,
      },
      placement,
      orientation,
      note: note || null,
    });
  } catch (error) {
    if (error instanceof AiError) {
      throw new ApiError(
        error.failure === "rate_limited" ? "rate_limited" : "conflict",
        MESSAGE[error.failure] ?? MESSAGE.upstream,
      );
    }
    throw error;
  }

  return ok({
    /* A data URL rather than a hosted one, because nothing is hosted —
       see the note at the top of this file. */
    image: `data:${render.contentType};base64,${render.data.toString("base64")}`,
    placement,
    /* Returned with every render rather than hard-coded in the component,
       so the words a customer is shown and the words this module
       guarantees are the same string. */
    disclaimer: VISUAL_DISCLAIMER,
    /* True when the render had Quoin's own photograph to work from. The
       client says so: "rendered from our photograph of this product" is a
       materially stronger claim than a render from a description, and the
       customer cannot tell them apart by looking. */
    fromProductPhoto: productPhoto != null,
  });
});

/**
 * Fetches Quoin's own product photograph for use as a reference.
 *
 * Failure is not an error: the render falls back to describing the
 * product in words, which is the same path a product with no photography
 * takes anyway. So this returns null rather than throwing, and logs
 * enough to notice if it starts failing for everything.
 */
async function fetchPhoto(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    /* A relative path — most of the catalogue's imagery is served from
       this app's own `public/` — needs an origin before `fetch` will take
       it. `siteOrigin()` is the same resolution order metadata uses. */
    const absolute = url.startsWith("http") ? url : new URL(url, siteOrigin()).toString();

    /* A short timeout: this is an optional enrichment sitting in front of
       a 40-second render, and it must not be what makes the request time
       out. */
    const response = await fetch(absolute, { signal: AbortSignal.timeout(6_000) });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!isVisualisableContentType(contentType)) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    /* A reference image larger than the room photograph is a waste of
       upload; the catalogue has nothing this big, so this is a guard. */
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;

    return { buffer: bytes, contentType };
  } catch (error) {
    console.error("[visualise] could not fetch product photo", {
      message: (error as { message?: string } | null)?.message,
    });
    return null;
  }
}
