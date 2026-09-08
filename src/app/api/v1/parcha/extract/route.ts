import { ApiError, handler, ok } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import { callerIp, hashIp } from "@/lib/data/parcha-submissions";
import {
  classifyFile,
  decideExtractionAction,
  decodeCsvBuffer,
  extractCsvLines,
} from "@/lib/parcha-extract";
import {
  ParchaReadError,
  isParchaReaderConfigured,
  parchaModel,
  readParchaFile,
  type ParchaExtractedItem,
} from "@/lib/parcha-openai";

/**
 * POST /api/v1/parcha/extract
 *
 * Reads an uploaded parcha — a photograph, a scan, a PDF or a CSV — and
 * answers with the materials on it, as text shaped exactly like a typed
 * list. The browser puts that text into the same textarea a customer
 * would have typed into, they edit it, and the existing "Price this list"
 * flow runs unchanged. Nothing is ordered, matched or persisted here.
 *
 * **The key never reaches the browser.** This route exists so that it
 * cannot: `OPENAI_API_KEY` is read by `src/lib/parcha-openai.ts`, which
 * imports `src/lib/env.ts` and therefore throws if anything ever tries to
 * bundle it for the client. The browser posts bytes here and never talks
 * to api.openai.com. Nothing upstream is echoed back either — every
 * failure below is logged server-side and answered with a sentence
 * written for a customer, the same discipline the Razorpay and Supabase
 * routes follow.
 *
 * `POST /api/parse-parcha` is an alias onto this handler — one
 * implementation, two paths; see the note in
 * `src/app/api/parse-parcha/route.ts`. Anything changed here changes both,
 * except `runtime` and `maxDuration`, which Next reads per file and which
 * that file therefore declares for itself.
 *
 * Multipart rather than the signed-direct-upload flow in
 * `/api/v1/uploads`, deliberately. That flow is right for a file being
 * *kept*: it writes a `StoredFile`, needs a session, and needs a bucket
 * provisioned. This one keeps nothing — the bytes exist for the length of
 * one request — so requiring an account and object storage to read a
 * photograph would be asking a contractor to sign up before finding out
 * whether the feature works at all. The trade is the platform body cap
 * (~4.5MB on Vercel), which the browser handles by re-encoding
 * photographs before they are sent; see `prepareImageForUpload` in
 * `src/lib/parcha-image.ts`.
 */

/* Node, not edge: `readParchaFile` base64s a Buffer, and the OpenAI SDK
   wants a real Node runtime. */
export const runtime = "nodejs";

/* A multi-page PDF genuinely takes tens of seconds to read. The reader's
   own timeout is 55s so that the failure a customer sees is this app's
   friendly one rather than the platform's bare 504. */
export const maxDuration = 60;

/**
 * The same 10MB the workbench shows.
 *
 * Checked here as well as there because the browser's limit is a courtesy
 * to the customer and this one is the actual rule — a client check is a
 * suggestion to anyone holding curl.
 */
const MAX_BYTES = 10 * 1024 * 1024;

/** ---- Rate limiting ------------------------------------------------------
 *
 * Every call here spends money at a third party, so it needs a limiter,
 * and unlike `/api/v1/parcha/submissions` it has no row of its own to
 * count: nothing is persisted, so `ParchaSubmission.createdAt` — which
 * `checkGuestRateLimit` counts — never moves.
 *
 * In-process rather than a new table, and the honest description of what
 * that buys is: it stops one browser from looping, and it stops an
 * accidental retry storm. It does not stop a determined attacker, because
 * each serverless instance keeps its own map and a burst spread across
 * instances gets a fresh budget per instance. That is a real limit, not a
 * detail — written down here rather than left for someone to discover
 * from a bill. Making it exact means a `ParchaExtraction` table and a
 * migration, which is the right change if this ever faces real abuse.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 12;
const recentByCaller = new Map<string, number[]>();

function withinRateLimit(key: string): boolean {
  const now = Date.now();
  const since = now - RATE_WINDOW_MS;
  const hits = (recentByCaller.get(key) ?? []).filter((t) => t > since);

  if (hits.length >= RATE_MAX) {
    recentByCaller.set(key, hits);
    return false;
  }

  hits.push(now);
  recentByCaller.set(key, hits);

  /* Bounded so a long-lived instance cannot accumulate a key per caller
     forever. Cheap because it only runs once the map is already large. */
  if (recentByCaller.size > 5_000) {
    for (const [k, times] of recentByCaller) {
      if (times.every((t) => t <= since)) recentByCaller.delete(k);
    }
  }

  return true;
}

/** ---- Customer-facing failure text ---------------------------------------
 *
 * One sentence per reason, written for someone standing at a counter with
 * a piece of paper. None of them quote the upstream error, and all of
 * them leave the door open: the textarea still holds whatever was typed,
 * and sending the file to a person is still one click away.
 */
const MESSAGE: Record<string, string> = {
  not_configured:
    "Reading files automatically is not switched on yet. Type the list below, or send the file to an expert and we will price it by hand.",
  unsupported:
    "We cannot read that file automatically. Attach a PDF or a photo (JPG, PNG or WEBP), or type the list below.",
  empty:
    "We could not find any materials in that file. If the handwriting is faint, try a brighter photo — or type the list below.",
  invalid_response:
    "We could not read that file cleanly. Try again, or type the list below.",
  rate_limited:
    "We are reading a lot of parchas just now. Wait a minute and try again, or type the list below.",
  timeout:
    "That file took too long to read. Try a single page or a smaller photo, or type the list below.",
  upstream:
    "We could not read that file just now. Try again in a moment, or type the list below.",
};

export const POST = handler(async (request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new ApiError("bad_request", "Send the file as multipart/form-data");
  }

  const session = await getSession();
  /* Signed in, counted by account; a guest, by a hashed address — the
     same split, and the same reason for hashing, as
     `/api/v1/parcha/submissions`. No raw IP is stored anywhere. */
  const key = session ? `u:${session.userId}` : `ip:${hashIp(callerIp(request.headers))}`;
  if (!withinRateLimit(key)) {
    throw new ApiError("rate_limited", MESSAGE.rate_limited);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    /* Also the shape of a body the platform refused for size, which is
       why the message names size rather than only naming the format. */
    throw new ApiError(
      "bad_request",
      "We could not receive that file. It may be too large — try a smaller photo.",
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("bad_request", "Attach a file to read.");
  }
  if (file.size === 0) {
    throw new ApiError("bad_request", "That file is empty. Try attaching it again.");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(
      "bad_request",
      `That file is larger than ${MAX_BYTES / 1024 / 1024}MB. Try a smaller photo or a single page.`,
    );
  }

  const kind = classifyFile(file.type, file.name);
  const decision = decideExtractionAction(kind, isParchaReaderConfigured());

  /* A spreadsheet export needs no model and no network — the CSV reader
     in `parcha-extract.ts` has always been real. Handled first so that an
     unconfigured deploy still reads one. */
  if (decision.action === "parse_csv") {
    const buffer = Buffer.from(await file.arrayBuffer());
    const lines = extractCsvLines(decodeCsvBuffer(buffer));
    if (lines.length === 0) {
      throw new ApiError("bad_request", MESSAGE.empty);
    }
    return ok({ items: null, text: lines.join("\n"), itemCount: lines.length, source: "csv" });
  }

  if (decision.action === "manual_review") {
    /* `not_configured` when a reader would have handled this kind, and
       `unsupported` when nothing ever could — two different sentences,
       because "switch on the key" and "send a different file" are two
       different things for the customer to do. */
    const reason =
      (kind === "pdf" || kind === "image") && !isParchaReaderConfigured()
        ? "not_configured"
        : "unsupported";
    throw new ApiError("conflict", MESSAGE[reason]);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let items: ParchaExtractedItem[];
  let text: string;
  try {
    const reading = await readParchaFile({
      buffer,
      contentType: file.type,
      filename: file.name,
    });
    items = reading.items;
    text = reading.text;
  } catch (error) {
    if (!(error instanceof ParchaReadError)) throw error;

    /* The upstream message is logged, never returned. It routinely names
       the organisation, the project and the quota, and `model` is logged
       alongside it because "this account cannot use that model" is the
       single most likely first-deploy failure and is invisible otherwise.
       The API key is not in either value. */
    console.error("[parcha/extract] read failed", {
      reason: error.reason,
      model: parchaModel(),
      detail: error.message,
    });

    if (error.reason === "rate_limited") {
      throw new ApiError("rate_limited", MESSAGE.rate_limited);
    }
    if (error.reason === "empty") {
      /* Not an error on this app's side — the file was read, and had
         nothing on it. 400 rather than 500 so a retry is not suggested by
         the status alone. */
      throw new ApiError("bad_request", MESSAGE.empty);
    }
    if (error.reason === "not_configured" || error.reason === "unsupported") {
      throw new ApiError("conflict", MESSAGE[error.reason]);
    }
    throw new ApiError("internal", MESSAGE[error.reason] ?? MESSAGE.upstream);
  }

  return ok({
    items,
    text,
    itemCount: items.length,
    source: kind === "pdf" ? "pdf" : "image",
  });
});
