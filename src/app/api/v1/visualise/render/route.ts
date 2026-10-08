import { ApiError, handler, ok } from "@/lib/http";
import { enforce } from "@/lib/rate-limit";
import { RenderError, isRenderConfigured, parseSpec, renderInRoom } from "@/lib/visualise-render";

/**
 * The optional AI redraw behind "See it in your space".
 *
 * `GET`  says whether it is switched on, so the page can leave the button
 *        out rather than show one that fails. Configuration only; free.
 * `POST` takes the customer's room photograph (multipart, field `room`),
 *        optionally the product's picture (`product`), and a small JSON
 *        `spec` saying what to draw. It answers with one PNG as a data URL.
 *
 * It is only ever called when the customer has pressed a button that says
 * their photograph is being sent to an AI service. Nothing is stored.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

/** The page shrinks the photograph well below this before sending it. */
const MAX_ROOM_BYTES = 4 * 1024 * 1024;
const MAX_PRODUCT_BYTES = 2 * 1024 * 1024;

const MESSAGE: Record<string, string> = {
  not_configured: "The realistic AI view is not switched on yet. The preview on your photo still works.",
  unsupported: "We cannot read that photo. Use a JPG, PNG or WEBP photo.",
  invalid_response: "The AI view did not come back cleanly. Try again in a moment.",
  rate_limited: "You have made several AI views just now. Wait a few minutes, or keep using the preview.",
  timeout: "That took too long. Try again, or keep using the preview.",
  upstream: "We could not make the AI view just now. Try again in a moment.",
};

export const GET = handler(async () => ok({ enabled: isRenderConfigured() }));

export const POST = handler(async (request) => {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("multipart/form-data")) {
    throw new ApiError("bad_request", "Send the photo as multipart/form-data");
  }
  if (!isRenderConfigured()) throw new ApiError("conflict", MESSAGE.not_configured);

  /* Counted before the body is read, so a flood is refused cheaply. */
  enforce("render", request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("bad_request", "We could not receive that photo. It may be too large.");
  }

  const room = form.get("room");
  if (!(room instanceof File) || room.size === 0) throw new ApiError("bad_request", "Attach your room photo.");
  if (room.size > MAX_ROOM_BYTES) throw new ApiError("bad_request", "That photo is too large. Try a smaller one.");

  const product = form.get("product");
  if (product instanceof File && product.size > MAX_PRODUCT_BYTES) {
    throw new ApiError("bad_request", "The product picture is too large.");
  }

  const spec = parseSpec(form.get("spec"));
  if (!spec) throw new ApiError("bad_request", "That request was not understood.");

  try {
    const b64 = await renderInRoom({
      room: { buffer: Buffer.from(await room.arrayBuffer()), contentType: room.type },
      product:
        product instanceof File && product.size > 0
          ? { buffer: Buffer.from(await product.arrayBuffer()), contentType: product.type }
          : null,
      spec,
    });
    return ok({ image: `data:image/png;base64,${b64}` });
  } catch (error) {
    if (!(error instanceof RenderError)) throw error;
    /* The upstream text is logged and never returned. */
    console.error("[visualise/render] failed", { reason: error.reason, detail: error.message });
    if (error.reason === "rate_limited") throw new ApiError("rate_limited", MESSAGE.rate_limited);
    if (error.reason === "unsupported") throw new ApiError("bad_request", MESSAGE.unsupported);
    if (error.reason === "not_configured") throw new ApiError("conflict", MESSAGE.not_configured);
    throw new ApiError("internal", MESSAGE[error.reason] ?? MESSAGE.upstream);
  }
});
