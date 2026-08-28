import { handler, ok } from "@/lib/http";
import { getCategories } from "@/lib/data/catalog";

/**
 * GET /api/v1/categories
 *
 * Unpaginated, matching the endpoint this replaces: the list is short and
 * every client renders all of it as navigation.
 */
export const GET = handler(async () => ok({ categories: await getCategories() }));
