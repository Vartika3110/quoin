import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser, viewerId } from "@/lib/http";
import {
  RoomSchema,
  VisibilitySchema,
  deleteSpace,
  getSpace,
  updateSpace,
} from "@/lib/data/studio";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BUDGET_PAISE = 10_000_000_000;

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  room: RoomSchema.optional(),
  description: z.string().trim().max(400).optional(),
  notes: z.string().max(8000).optional(),
  budgetPaise: z.number().int().min(0).max(MAX_BUDGET_PAISE).optional(),
  /* Explicitly nullable: clearing a cover and not mentioning it are
     different requests, and `undefined` has to keep meaning "leave it". */
  coverIdeaId: z.string().trim().min(1).max(40).nullable().optional(),
  projectId: z.string().trim().min(1).max(40).nullable().optional(),
  visibility: VisibilitySchema.optional(),
});

/**
 * GET /api/v1/studio/spaces/{id}
 *
 * By id or by slug, and readable by anyone when the space is public — a
 * shared link has to work for someone who is not signed in. `canEdit` in
 * the response tells the client whether to draw controls; it is not what
 * enforces anything, which is done again on every write below.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const { id } = await params;

  const space = await getSpace(id, await viewerId());
  if (!space) throw new ApiError("not_found", "No such space");

  return ok({ space });
});

/** PATCH /api/v1/studio/spaces/{id} */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const patch = await parseBody(request, Patch);

  if (!(await updateSpace(user.id, id, patch))) {
    throw new ApiError("not_found", "No such space");
  }

  const space = await getSpace(id, user.id);
  return ok({ space });
});

/**
 * DELETE /api/v1/studio/spaces/{id}
 *
 * Takes the room's items and its moodboard with it — both cascade — but
 * not the ideas themselves, which stay saved. Deleting a folder is not
 * meant to un-save the things that were in it.
 */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;

  if (!(await deleteSpace(user.id, id))) {
    throw new ApiError("not_found", "No such space");
  }
  return ok({ deleted: true });
});
