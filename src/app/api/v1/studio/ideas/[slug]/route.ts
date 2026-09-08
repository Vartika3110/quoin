import { ApiError, handler, ok, requireUser, viewerId } from "@/lib/http";
import { deleteIdea, getIdeaBySlug, listRelatedIdeas } from "@/lib/data/studio";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/studio/ideas/{slug}
 *
 * One idea plus what else looks like it. Public, so no `requireUser` —
 * but visibility is inside `getIdeaBySlug`'s `where` clause, which is
 * what makes someone else's private upload 404 rather than 403. A 403
 * would confirm the slug exists.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const { slug } = await params;
  const viewer = await viewerId();

  const idea = await getIdeaBySlug(slug, viewer);
  if (!idea) throw new ApiError("not_found", "No such idea");

  return ok({ idea, related: await listRelatedIdeas(idea, viewer) });
});

/**
 * DELETE /api/v1/studio/ideas/{slug}
 *
 * The uploader's own idea. The `StoredFile` behind it is deliberately
 * left alone — `StudioIdea.fileId` is `onDelete: Restrict` in the other
 * direction, and the bytes are cleaned up by whatever reaps abandoned
 * files, not by a route the customer triggers.
 */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { slug } = await params;

  const idea = await getIdeaBySlug(slug, user.id);
  if (!idea) throw new ApiError("not_found", "No such idea");

  if (!(await deleteIdea(user.id, idea.id))) {
    throw new ApiError("not_found", "No such idea");
  }
  return ok({ deleted: true });
});
