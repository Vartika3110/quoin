import { ApiError, handler, ok } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import { callerIp, hashIp } from "@/lib/data/parcha-submissions";
import { enforceKeyed } from "@/lib/rate-limit";
import { AiError, isAiConfigured } from "@/lib/ai/client";
import { AI_MESSAGE } from "@/lib/ai/messages";
import { isVisualSearchContentType, readProductPhoto } from "@/lib/ai/visual-search";
import { matchGuesses } from "@/lib/data/ai-match";
import { getCategories } from "@/lib/data/catalog";

/**
 * POST /api/v1/search/visual
 *
 * Searching the catalogue with a photograph. The browser posts one image
 * and gets back what Quoin thinks is in it, with real products under each
 * identification.
 *
 * **The key never reaches the browser.** This route exists so that it
 * cannot: `OPENAI_API_KEY` is read by `src/lib/ai/client.ts`, which
 * imports `src/lib/env.ts` and therefore throws if anything tries to
 * bundle it for the client. The browser posts bytes here and never talks
 * to api.openai.com. Nothing upstream is echoed back either — every
 * failure is logged server-side and answered with a sentence written for
 * a customer, the same discipline the parcha, Razorpay and Supabase
 * routes follow.
 *
 * **Nothing is persisted.** The photograph exists for the length of one
 * request and is never written to storage. A customer pointing a camera
 * at their own bathroom has not asked Quoin to keep a picture of it, and
 * the feature does not need one: the answer is a list of catalogue rows.
 * That is also why this is multipart rather than the signed-upload flow
 * in `/api/v1/uploads` — that flow is for a file being *kept*, and would
 * need an account and a provisioned bucket to find out whether a search
 * works at all.
 *
 * Open to guests, deliberately. Somebody who has not signed in is exactly
 * the person this feature is for, and `enforceKeyed` is what makes that
 * affordable.
 */

/* Node, not edge: the reader base64s a Buffer and the OpenAI SDK wants a
   real Node runtime. */
export const runtime = "nodejs";

/* The reader's own timeout is 50s, so the failure a customer sees is this
   app's sentence rather than the platform's bare 504. */
export const maxDuration = 60;

/**
 * The same 10MB the client shows.
 *
 * Checked here as well as in the browser because the browser's limit is a
 * courtesy to the customer and this one is the actual rule — a client
 * check is a suggestion to anyone holding curl. Photographs are re-
 * encoded before upload in any case; see `prepareImageForUpload`.
 */
const MAX_BYTES = 10 * 1024 * 1024;

/** How many products to offer under each identification. Eight is two
    rows of four on a desktop and a scrollable rail on a phone. */
const PER_GUESS = 8;

export const POST = handler(async (request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new ApiError("bad_request", "Send the photo as multipart/form-data");
  }

  /* Before anything is read off the wire: an unconfigured deploy should
     say so immediately rather than accept a 10MB upload and then explain
     it cannot use it. */
  if (!isAiConfigured()) {
    throw new ApiError("conflict", AI_MESSAGE.not_configured);
  }

  const session = await getSession();
  /* Signed in, counted by account; a guest, by a hashed address — the
     same split, and the same reason for hashing, as the parcha routes.
     No raw address is stored anywhere. */
  const key = session
    ? `u:${session.userId}`
    : `ip:${hashIp(callerIp(request.headers))}`;
  enforceKeyed(
    "aiVisualSearch",
    key,
    (seconds) =>
      `You have searched by photo a few times just now. Try again in ${seconds} seconds, or search by typing.`,
  );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    /* Also the shape of a body the platform refused for size, which is
       why the message names size rather than only naming the format. */
    throw new ApiError(
      "bad_request",
      "We could not receive that photo. It may be too large — try a smaller one.",
    );
  }

  const file = form.get("photo");
  if (!(file instanceof File)) {
    throw new ApiError("bad_request", "Attach a photo to search with.");
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
  if (!isVisualSearchContentType(file.type)) {
    throw new ApiError("bad_request", AI_MESSAGE.unsupported);
  }

  /* The real departments, so the model classifies into Quoin's taxonomy
     rather than its own — see the grounding note in `visual-search.ts`.
     Read before the model call rather than alongside the match, because
     the call needs it. */
  const categories = await getCategories();

  const buffer = Buffer.from(await file.arrayBuffer());

  let reading;
  try {
    reading = await readProductPhoto({
      buffer,
      contentType: file.type,
      departments: categories.map((c) => ({ slug: c.slug, name: c.title })),
    });
  } catch (error) {
    if (error instanceof AiError) {
      /* `empty` is not a malfunction — the photograph genuinely held
         nothing Quoin sells — so it answers 200 with an empty result and
         the reason, and the client renders "nothing found" rather than an
         error. Everything else is a failure. */
      if (error.failure === "empty") {
        return ok({ summary: "", matches: [], note: AI_MESSAGE.empty });
      }
      throw new ApiError(
        error.failure === "rate_limited" ? "rate_limited" : "conflict",
        AI_MESSAGE[error.failure],
      );
    }
    throw error;
  }

  const matches = await matchGuesses(reading.guesses, PER_GUESS);

  return ok({
    summary: reading.summary,
    /* Every identification is returned, including ones that matched no
       product. The customer can see Quoin understood the photograph and
       simply does not stock that thing — which is a different and more
       trustworthy answer than silently showing fewer results. */
    matches: matches.map((match) => ({
      label: match.guess.label,
      detail: match.guess.detail,
      brand: match.guess.brand,
      department: match.department,
      products: match.products,
    })),
    note: null,
  });
});
