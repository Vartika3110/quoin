import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/http";
import { resolveServiceability } from "@/lib/geo";

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * GET /api/v1/serviceability?lat=&lng=
 *
 * Backs the "18 minutes · 1.1 km away" header. Public — the storefront
 * must be able to answer it before the customer signs in, otherwise the
 * first thing a new visitor sees is a login wall.
 */
export const GET = handler(async (request) => {
  const url = new URL(request.url);
  const parsed = Query.safeParse({
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng"),
  });

  if (!parsed.success) {
    throw new ApiError("bad_request", "Provide a valid lat and lng");
  }

  /* Every active store is loaded and compared in memory. That is correct
     while the fleet is small; at a few hundred stores this becomes a
     PostGIS `ST_DWithin` query against a GiST index instead. */
  const stores = await db.store.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      lat: true,
      lng: true,
      serviceRadiusKm: true,
      baseEtaMinutes: true,
    },
  });

  const result = resolveServiceability(parsed.data, stores);

  return ok({
    serviceable: result.serviceable,
    distanceKm: result.distanceKm,
    etaMinutes: result.etaMinutes,
    /* Store identity is intentionally not returned — the customer has no
       use for it and it exposes the dark-store network to competitors. */
    storeName: result.store?.name ?? null,
  });
});
