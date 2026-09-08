import { z } from "zod";
import { handler, ok, parseBody, requireUser } from "@/lib/http";
import { saveIdea } from "@/lib/data/studio";

const Body = z.object({
  ideaId: z.string().trim().min(1).max(40),
  /* Saving and filing in one request, because the save sheet asks both
     questions at once and two round trips would let the second fail after
     the heart had already filled. Empty means "♡ My Inspiration" only,
     which is a real destination and not a missing choice. */
  spaceIds: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
});

/**
 * POST /api/v1/studio/save
 *
 * Saves an idea and optionally files it into Spaces. Idempotent — see
 * `saveIdea`, which is one transaction over a unique constraint, so a
 * double tap on a slow connection is one save rather than a conflict.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, Body);

  return ok(await saveIdea(user.id, body.ideaId, body.spaceIds));
});
