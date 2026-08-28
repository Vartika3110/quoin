import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/http";
import { resolveServiceability } from "@/lib/geo";
import { findAreaByPincode } from "@/lib/data/service-areas";

/**
 * Coordinates must be present, not merely coercible.
 *
 * `z.coerce.number()` alone turns a missing parameter into 0, so a
 * request carrying no location at all validated as (0, 0) — a point in
 * the Atlantic — and came back "not serviceable". The caller could not
 * tell a genuine no from its own malformed request. The string gate in
 * front rejects the absent value before coercion sees it.
 */
const coord = (min: number, max: number) =>
  z.string().min(1).transform(Number).pipe(z.number().min(min).max(max));

const Query = z.object({
  lat: coord(-90, 90),
  lng: coord(-180, 180),
});

/** Indian postal codes are six digits and never start with zero. */
const Pincode = z.string().regex(/^[1-9][0-9]{5}$/);

/**
 * GET /api/v1/serviceability?lat=&lng=  — the delivery promise
 * GET /api/v1/serviceability?pincode=   — does Quoin cover this area
 *
 * Backs the "18 minutes · 1.1 km away" header, and the pincode box a
 * visitor uses before they have given an address. Public — the storefront
 * must be able to answer it before the customer signs in, otherwise the
 * first thing a new visitor sees is a login wall.
 *
 * The two are answered separately and must not be conflated. Coordinates
 * give a real promise; a pincode only says Quoin operates in the area,
 * because a pincode straddles store radii and half of it can be outside
 * the eighteen minutes.
 */
export const GET = handler(async (request) => {
  const url = new URL(request.url);

  const rawPincode = url.searchParams.get("pincode");
  if (rawPincode !== null) {
    const pincode = Pincode.safeParse(rawPincode.trim());
    if (!pincode.success) {
      throw new ApiError("bad_request", "Enter a six-digit pincode");
    }

    const area = await findAreaByPincode(pincode.data);

    return ok({
      pincode: pincode.data,
      serviceable: area !== null,
      /* Named back to the customer: "We deliver to Janakpuri" is a far
         stronger confirmation than a bare tick. */
      area: area && { name: area.name, slug: area.slug, city: area.city },
      /* No ETA here on purpose — that needs coordinates. */
      etaMinutes: null,
    });
  }

  const parsed = Query.safeParse({
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng"),
  });

  if (!parsed.success) {
    throw new ApiError("bad_request", "Provide a valid lat and lng, or a pincode");
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
