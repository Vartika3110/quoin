import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser, viewerId } from "@/lib/http";
import { getOrCreateMoodboard, saveMoodboardLayout } from "@/lib/data/studio";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/studio/spaces/{id}/moodboard
 *
 * The canvas, created on first look by its owner. A visitor to a shared
 * room gets the board if there is one and a 404 if the owner never
 * arranged it — looking at somebody's room must not write rows into it.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const { id } = await params;

  const moodboard = await getOrCreateMoodboard(id, await viewerId());
  if (!moodboard) throw new ApiError("not_found", "No moodboard here");

  return ok({ moodboard });
});

/** Canvas units, not pixels. See `Moodboard.canvasWidth`. */
const coord = () => z.number().int().min(-10_000).max(10_000);
const extent = () => z.number().int().min(16).max(10_000);

const Body = z.object({
  /* The whole board. See `saveMoodboardLayout` — a drag produces a stream
     of overlapping writes, and a dropped delta leaves a tile somewhere
     nobody put it with nothing to correct it. */
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1).max(40),
        x: coord(),
        y: coord(),
        width: extent(),
        height: extent(),
        z: z.number().int().min(0).max(10_000),
      }),
    )
    .max(300),
  canvas: z.object({ width: extent(), height: extent() }).optional(),
});

/** PUT /api/v1/studio/spaces/{id}/moodboard — replace the layout. PUT
    rather than PATCH because the body *is* the whole resource. */
export const PUT = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, Body);

  const moodboard = await saveMoodboardLayout(user.id, id, body.items, body.canvas);
  if (!moodboard) throw new ApiError("not_found", "No such space");

  return ok({ moodboard });
});
