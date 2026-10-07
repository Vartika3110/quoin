import { ApiError, handler, ok } from "@/lib/http";
import { enforce } from "@/lib/rate-limit";
import {
  PhotoSearchError,
  isPhotoSearchConfigured,
  photoSearchModel,
  readPhotoForSearch,
} from "@/lib/photo-search-openai";

/**
 * Search by photograph.
 *
 * `GET`  says whether the feature is switched on, so the search palette can
 *        leave the camera button out rather than show one that fails. It
 *        reads configuration only and costs nothing.
 * `POST` takes one image (multipart, field `file`) and answers with a short
 *        description and one to four search terms. It never answers with
 *        products: the browser runs the terms through ordinary search, so
 *        what the customer sees is the real catalogue and nothing the model
 *        made up.
 *
 * Nothing is stored. The bytes exist for the length of the request.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/** Matches the browser's own re-encoding target with room to spare. The
    platform's ~4.5MB body cap bites first on Vercel; this is the rule. */
const MAX_BYTES = 8 * 1024 * 1024;

const MESSAGE: Record<string, string> = {
  not_configured: "Search by photo is not switched on yet. Type what you are looking for instead.",
  unsupported: "We cannot read that file. Use a JPG, PNG or WEBP photo.",
  nothing_found:
    "We could not tell what to search for from that photo. Try a closer, brighter shot of the item.",
  invalid_response: "We could not read that photo cleanly. Try again, or type what you are looking for.",
  rate_limited: "You have searched by photo a lot just now. Wait a few minutes, or type your search.",
  timeout: "That took too long. Try again, or type what you are looking for.",
  upstream: "We could not read that photo just now. Try again in a moment, or type your search.",
};

export const GET = handler(async () => ok({ enabled: isPhotoSearchConfigured() }));

export const POST = handler(async (request) => {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("multipart/form-data")) {
    throw new ApiError("bad_request", "Send the photo as multipart/form-data");
  }
  if (!isPhotoSearchConfigured()) {
    throw new ApiError("conflict", MESSAGE.not_configured);
  }

  /* Counted before the body is read, so a flood is refused cheaply. */
  enforce("photo", request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("bad_request", "We could not receive that photo. It may be too large.");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError("bad_request", "Attach a photo to search with.");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError("bad_request", "That photo is too large. Try a smaller one.");
  }

  try {
    const reading = await readPhotoForSearch({
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });
    return ok(reading);
  } catch (error) {
    if (!(error instanceof PhotoSearchError)) throw error;

    /* The upstream text is logged and never returned: it can name the
       organisation, the project and the quota. */
    console.error("[search/photo] failed", {
      reason: error.reason,
      model: photoSearchModel(),
      detail: error.message,
    });

    if (error.reason === "rate_limited") throw new ApiError("rate_limited", MESSAGE.rate_limited);
    if (error.reason === "nothing_found" || error.reason === "unsupported") {
      throw new ApiError("bad_request", MESSAGE[error.reason]);
    }
    if (error.reason === "not_configured") throw new ApiError("conflict", MESSAGE.not_configured);
    throw new ApiError("internal", MESSAGE[error.reason] ?? MESSAGE.upstream);
  }
});
