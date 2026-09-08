import { handler, ok } from "@/lib/http";
import { listFacets } from "@/lib/data/studio";

/**
 * GET /api/v1/studio/facets
 *
 * The rooms, styles and materials that actually appear on public ideas,
 * for the filter rail. Read from the data rather than hard-coded so the
 * rail never offers a chip that returns nothing — see `listFacets`.
 */
export const GET = handler(async () => ok(await listFacets()));
