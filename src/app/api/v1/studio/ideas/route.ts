import { z } from "zod";
import { handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  RoomSchema,
  SwatchSchema,
  VisibilitySchema,
  createIdea,
} from "@/lib/data/studio";

/**
 * A photograph's pixel dimensions.
 *
 * Bounded on both ends. Below 64px is not a photograph of a room, and the
 * upper bound is generous rather than tight — a phone shoots 4032px and a
 * mirrorless camera more — but it is a bound, in the same spirit as
 * `MAX_UPLOAD_BYTES`. These are declared by the client and are used only
 * to reserve the right shape of box in the grid, never to decide what is
 * served, so a wrong value costs a reflow and nothing else.
 */
const dimension = () => z.number().int().min(64).max(20000);

const Body = z.object({
  title: z.string().trim().min(1, "Give it a title").max(120),
  description: z.string().trim().max(600).optional().default(""),
  fileId: z.string().trim().min(1).max(40),
  width: dimension(),
  height: dimension(),
  /* A data URI of a ~16px thumbnail. Capped because it is inlined into
     every card's markup — a large one would cost more than the image. */
  blurDataUrl: z
    .string()
    .startsWith("data:image/", "Not an inline image")
    .max(4000)
    .optional(),
  room: RoomSchema.optional(),
  styles: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  materials: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  /* Entered by a person. Nothing in this app looks at a photograph — see
     the note on `StudioIdea.colors` — so this arrives from the form, and
     the UI it comes from says so rather than implying extraction. */
  colors: z.array(SwatchSchema).max(12).optional().default([]),
  visibility: VisibilitySchema.optional().default("private"),
});

/**
 * POST /api/v1/studio/ideas
 *
 * Records an already-uploaded image as an inspiration idea. The bytes
 * went straight from the browser to the bucket through
 * `/api/v1/uploads` — this route only ever sees the `StoredFile` id, and
 * `createIdea` checks that the file is confirmed and belongs to the
 * caller before anything is written.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, Body);

  const idea = await createIdea(user.id, {
    title: body.title,
    description: body.description,
    fileId: body.fileId,
    width: body.width,
    height: body.height,
    blurDataUrl: body.blurDataUrl,
    room: body.room,
    styles: body.styles,
    materials: body.materials,
    colors: body.colors,
    visibility: body.visibility,
  });

  return ok({ idea }, { status: 201 });
});
