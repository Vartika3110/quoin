import { z } from "zod";
import { handler, ok, viewerId } from "@/lib/http";
import {
  FEED_PAGE_SIZE,
  FeedTabSchema,
  RoomSchema,
  listFeed,
} from "@/lib/data/studio";

/**
 * GET /api/v1/studio/feed
 *
 * The inspiration feed. Public — a signed-out visitor browses ideas, and
 * that is most of the point of Studio — but personalised when there is a
 * session, which is why this reads `viewerId` rather than `requireUser`.
 *
 * Query: `tab`, `room`, `style` (repeatable), `material` (repeatable),
 * `q`, `cursor`, `limit`.
 *
 * Keyset pagination, so `cursor` is the id of the last row of the
 * previous page rather than an offset. See `listFeed` for why.
 */
const Query = z.object({
  tab: FeedTabSchema.optional(),
  room: RoomSchema.optional(),
  style: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  material: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  q: z.string().trim().max(120).optional(),
  cursor: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

export const GET = handler(async (request) => {
  const url = new URL(request.url);
  const params = url.searchParams;

  /* An invalid filter is not worth a 400 on a page whose whole job is to
     render photographs: an unknown room in a hand-edited URL falls back
     to the unfiltered feed rather than an error state. `safeParse` and a
     default is that decision, made once. */
  const parsed = Query.safeParse({
    tab: params.get("tab") ?? undefined,
    room: params.get("room") ?? undefined,
    style: params.getAll("style").length ? params.getAll("style") : undefined,
    material: params.getAll("material").length ? params.getAll("material") : undefined,
    q: params.get("q") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });

  const query = parsed.success ? parsed.data : {};

  const feed = await listFeed(await viewerId(), {
    tab: query.tab,
    room: query.room,
    styles: query.style,
    materials: query.material,
    q: query.q,
    cursor: query.cursor,
    limit: query.limit ?? FEED_PAGE_SIZE,
  });

  return ok(feed);
});
