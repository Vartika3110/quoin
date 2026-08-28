import { handler, ok } from "@/lib/http";
import { listBrands } from "@/lib/data/catalog";

/**
 * GET /api/v1/brands
 *
 * Only brands with something sellable, so the filter rail can never offer
 * a choice that returns an empty grid.
 */
export const GET = handler(async () => ok({ brands: await listBrands() }));
