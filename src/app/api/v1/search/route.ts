import { z } from "zod";
import { handler, ok } from "@/lib/http";
import { suggest } from "@/lib/data/search";

const Query = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

/**
 * GET /api/v1/search?q=
 *
 * Grouped suggestions for the command palette. Public, like the rest of
 * browse — search has to work before sign-in or the storefront is a
 * catalogue you have to log in to read.
 *
 * A term shorter than two characters returns empty groups rather than a
 * 400: the palette fires on every keystroke, and the first one is always
 * a single character.
 */
export const GET = handler(async (request) => {
  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return ok({ categories: [], brands: [], products: [], destinations: [], flat: [] });
  }

  return ok(await suggest(parsed.data.q, parsed.data.limit));
});
