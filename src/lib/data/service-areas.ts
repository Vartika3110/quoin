import { db } from "@/lib/db";

/**
 * Serviceable localities.
 *
 * Separate from `src/lib/geo.ts` on purpose. Geo answers "can a store
 * reach this exact point in eighteen minutes", which is the delivery
 * promise. This answers "does Quoin operate in this neighbourhood at
 * all", which is the coarser question a pincode box asks — and the two
 * must not be confused, because a pincode inside a serviceable area can
 * still sit outside every store radius.
 */

export interface ServiceAreaView {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  pincodes: string[];
}

/** Every live area, for the "where we deliver" list. */
export async function listServiceAreas(): Promise<ServiceAreaView[]> {
  const rows = await db.serviceArea.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { pincodes: { orderBy: { pincode: "asc" } } },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    state: row.state,
    pincodes: row.pincodes.map((p) => p.pincode),
  }));
}

/** The area a pincode belongs to, or null when Quoin does not serve it. */
export async function findAreaByPincode(
  pincode: string,
): Promise<ServiceAreaView | null> {
  const row = await db.servicePincode.findUnique({
    where: { pincode },
    include: { area: { include: { pincodes: { orderBy: { pincode: "asc" } } } } },
  });

  /* An inactive area is treated as not serviceable rather than 404 — the
     row exists so the pincode can be switched back on without re-entering
     it, but the customer must not be told we deliver there. */
  if (!row || !row.area.isActive) return null;

  return {
    id: row.area.id,
    name: row.area.name,
    slug: row.area.slug,
    city: row.area.city,
    state: row.area.state,
    pincodes: row.area.pincodes.map((p) => p.pincode),
  };
}
