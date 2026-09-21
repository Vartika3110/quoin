import { ApiError, handler, ok, viewerId } from "@/lib/http";
import { getIdeaBySlug, shopTheLook } from "@/lib/data/studio";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/studio/ideas/{slug}/look
 *
 * What you could buy to build a room like this one — the same
 * `shopTheLook` the idea page renders, on its own so the feed can ask for
 * one post at a time.
 *
 * **Separate from `GET /api/v1/studio/ideas/{slug}` on purpose, and not
 * folded into the feed.** Building a look runs the idea's materials
 * through the catalogue matcher, one query per term and up to eight terms
 * — fine for a page about a single room, and roughly three hundred
 * queries if the feed asked for forty posts at once. So the feed fetches
 * this per post as the post reaches the viewport, and a reader who
 * scrolls past ten of forty pays for ten.
 *
 * Public, like the idea itself. Visibility is enforced inside
 * `getIdeaBySlug`'s `where` clause, so someone else's private upload 404s
 * here rather than 403ing — a 403 would confirm the slug exists.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const { slug } = await params;
  const viewer = await viewerId();

  const idea = await getIdeaBySlug(slug, viewer);
  if (!idea) throw new ApiError("not_found", "No such idea");

  return ok({ look: await shopTheLook(idea) });
});
