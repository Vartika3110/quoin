/**
 * Getting a photograph of a parcha small enough to send.
 *
 * Browser-only — this module touches `document` and is imported by a
 * client component. It deliberately holds no key, no endpoint and no
 * business rule; it is a size and format adapter and nothing else.
 *
 * Two problems, one answer.
 *
 *  - **HEIC.** Every recent iPhone photographs in it by default, it is
 *    the single most likely thing a contractor will attach, and the model
 *    on the other end does not accept it. Safari can decode HEIC, so
 *    re-encoding in the browser converts the file at the one point in the
 *    chain where a decoder for it exists. On a browser that cannot decode
 *    it (Chrome on a desktop) the failure is caught and named, rather
 *    than becoming an unexplained rejection after a 6MB upload.
 *  - **Body size.** `POST /api/v1/parcha/extract` is an ordinary function
 *    request, and Vercel caps one of those at roughly 4.5MB — under the
 *    10MB the workbench offers, and under what a modern phone camera
 *    produces. Re-encoding at a sane resolution takes a 6MB photograph to
 *    a few hundred kilobytes.
 *
 * Quality is chosen for handwriting rather than for looks: 2200px on the
 * long edge keeps pencil on ruled paper legible, which is the whole job.
 * The original file is never modified, and a file that needs neither
 * conversion nor shrinking is returned untouched rather than round
 * -tripped through a lossy encoder for nothing.
 */

/** The limit the workbench shows and the extract route enforces. */
export const MAX_PARCHA_FILE_BYTES = 10 * 1024 * 1024;

/**
 * What to aim for after re-encoding.
 *
 * Comfortably under the platform's ~4.5MB request cap, with room for the
 * multipart envelope and for the cap being described as approximate.
 */
const TARGET_BYTES = 3 * 1024 * 1024;

/** Long edge, in pixels, after downscaling. */
const MAX_EDGE = 2200;

/** Tried in order until the result fits `TARGET_BYTES`. Handwriting
    survives 0.6 on paper; below that the strokes start to smear. */
const QUALITY_STEPS = [0.85, 0.7, 0.6];

/** What the extract route will send onwards without conversion. */
const PASS_THROUGH_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImagePrepareFailure =
  /** The browser has no decoder for this format — HEIC outside Safari. */
  | "decode"
  /** Decoded, but could not be re-encoded small enough to send. */
  | "too_large";

export class ImagePrepareError extends Error {
  constructor(
    readonly reason: ImagePrepareFailure,
    message: string,
  ) {
    super(message);
    this.name = "ImagePrepareError";
  }
}

/** Whether this file is one this module should touch at all. PDFs and
    CSVs are sent exactly as they are — re-encoding a PDF would be the
    "convert the document to screenshots" mistake, and the model reads the
    real file better than pictures of it. */
export function isImageFile(file: File): boolean {
  return file.type.toLowerCase().startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

/**
 * Returns a file ready to post, converting and shrinking only when there
 * is a reason to.
 *
 * Non-images pass straight through. So does an already-supported image
 * that is small enough — there is no gain in re-encoding a 400KB JPEG,
 * and a lossy pass over one costs legibility it cannot get back.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isImageFile(file)) return file;

  const type = file.type.toLowerCase();
  const supported = PASS_THROUGH_IMAGE_TYPES.has(type);
  if (supported && file.size <= TARGET_BYTES) return file;

  const source = await decode(file);
  /* An `<img>` reports its layout size in `width`; only `naturalWidth`
     is the pixel size of the file, and the two differ the moment a
     stylesheet touches images. An `ImageBitmap` has only the real one. */
  const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new ImagePrepareError("decode", "The browser could not read this image");
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new ImagePrepareError("decode", "No 2D canvas context");
    /* A parcha is dark ink on white paper. A PNG with transparency drawn
       onto an unpainted canvas encodes as ink on black, which is both
       unreadable and the kind of bug that only shows up on someone
       else's screenshot. */
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= TARGET_BYTES) {
        return new File([blob], renameToJpeg(file.name), {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }

    throw new ImagePrepareError("too_large", "Could not compress the photo enough to send");
  } finally {
    /* Frees the decoded pixels straight away rather than at the next GC —
       a full-resolution phone photo is tens of megabytes in memory. */
    if ("close" in source) source.close();
  }
}

/**
 * Decodes to something drawable.
 *
 * `createImageBitmap` first because it decodes off the main thread and
 * handles every format the browser knows. The `<img>` fallback exists for
 * Safari versions that do not take a `Blob` there — the same versions
 * most likely to be handing this function a HEIC in the first place.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* Falls through: a browser with no decoder for this format throws
         here, and the <img> path is worth one attempt before giving up. */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new ImagePrepareError("decode", "The browser could not read this image"));
      image.src = url;
    });
  } finally {
    /* Safe immediately: the element has already decoded by `onload`. */
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** So the server's content-type check and the visible filename agree
    about what was actually sent. */
export function renameToJpeg(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return `${base.length > 0 ? base : "parcha"}.jpg`;
}
