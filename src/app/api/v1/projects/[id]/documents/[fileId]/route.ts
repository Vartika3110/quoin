import { ApiError, handler, ok, requireUser } from "@/lib/http";
import { detachDocument } from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/**
 * DELETE /api/v1/projects/{id}/documents/{fileId}
 *
 * Detaches a document from a project. Removes only the `ProjectDocument`
 * join row — the underlying `StoredFile` is `Restrict`ed from this
 * relation on purpose and is untouched either way.
 */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, fileId } = await params;

  const removed = await detachDocument(user.id, id, fileId);
  if (!removed) throw new ApiError("not_found", "No such attached document");

  return ok({ deleted: true });
});
