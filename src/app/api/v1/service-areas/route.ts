import { handler, ok } from "@/lib/http";
import { listServiceAreas } from "@/lib/data/service-areas";

/**
 * GET /api/v1/service-areas
 *
 * Where Quoin operates, with the pincodes that reach each locality. Public
 * and unpaginated — it is a short list, and a visitor deciding whether to
 * bother signing up needs to see it before anything else.
 *
 * Coverage here is not the delivery promise. Use
 * `/api/v1/serviceability?lat=&lng=` for that; an address inside one of
 * these pincodes can still fall outside every store radius.
 */
export const GET = handler(async () => ok({ areas: await listServiceAreas() }));
