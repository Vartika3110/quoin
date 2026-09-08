import { ApiError, handler, ok, requireUser } from "@/lib/http";
import { unsaveIdea } from "@/lib/data/studio";

type Ctx = { params: Promise<{ ideaId: string }> };

/**
 * DELETE /api/v1/studio/save/{ideaId}
 *
 * Unsaves. Leaves the idea in any Space it was filed into — see
 * `unsaveIdea` for why removing it from a room someone has been building
 * is not what a tap on a filled heart means.
 */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { ideaId } = await params;

  if (!(await unsaveIdea(user.id, ideaId))) {
    throw new ApiError("not_found", "That idea was not saved");
  }
  return ok({ saved: false });
});
