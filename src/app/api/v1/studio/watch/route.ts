import { z } from "zod";
import { handler, ok, viewerId } from "@/lib/http";
import { WATCH_PAGE_SIZE, listWatchFeed } from "@/lib/data/studio";

/**
 * GET /api/v1/studio/watch
 *
 * The next page of clips. Public, like `/feed` and for the same reason —
 * watching is most of the point of Studio and a signed-out visitor does
 * it — but it reads `viewerId` so the heart on a clip is right for
 * somebody who is signed in.
 *
 * Query: `cursor`, `limit`. No filters, deliberately: there are a handful
 * of clips, a room filter over them would be a rail with one pill in it,
 * and the wall at `/studio` is where filtering belongs. That decision
 * gets revisited when there is enough footage for it to be a question.
 *
 * Each page carries its rooms' priced lists with it. `listWatchFeed` has
 * the reasoning — the list *is* the pin on this surface, and fetching it
 * on tap answers "what is that tap" after the moment has passed.
 */
const Query = z.object({
  cursor: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(16).optional(),
});

export const GET = handler(async (request) => {
  const params = new URL(request.url).searchParams;

  /* A malformed cursor falls back to the first page rather than a 400 —
     the same call `/feed` makes, for the same reason: this endpoint's
     whole job is to return rooms, and a hand-edited query string should
     degrade to the top of the feed, not to an error. */
  const parsed = Query.safeParse({
    cursor: params.get("cursor") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  const query = parsed.success ? parsed.data : {};

  const page = await listWatchFeed(await viewerId(), {
    cursor: query.cursor,
    limit: query.limit ?? WATCH_PAGE_SIZE,
  });

  return ok(page);
});
