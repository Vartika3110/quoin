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

/**
 * The name of the cookie holding the customer's chosen locality.
 *
 * A cookie rather than localStorage because the header is rendered on the
 * server: reading the choice on the client would mean shipping a default
 * first and correcting it after hydration, which shows every visitor the
 * wrong area for a moment.
 */
export const AREA_COOKIE = "quoin_area";

export interface AreaChoice {
  slug: string;
  name: string;
  city: string;
  /** From the store serving it. Null when no store is attached yet. */
  etaMinutes: number | null;
  storeName: string | null;
}

/**
 * Every area a customer may choose, with the promise attached to it.
 *
 * An area with no live store is not offered at all. The picker shows
 * names alone, so nothing on the row could warn that a particular one
 * cannot actually be delivered to — better to leave it off the list than
 * to let someone select it and find out later.
 */
export async function listAreaChoices(): Promise<AreaChoice[]> {
  const rows = await db.serviceArea.findMany({
    where: { isActive: true, store: { is: { isActive: true } } },
    orderBy: { name: "asc" },
    include: { store: { select: { name: true, baseEtaMinutes: true, isActive: true } } },
  });

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    city: row.city,
    etaMinutes: row.store?.isActive ? row.store.baseEtaMinutes : null,
    storeName: row.store?.isActive ? row.store.name : null,
  }));
}

/** One choice by slug, or null when the slug is stale or switched off. */
export async function getAreaChoice(slug: string | undefined): Promise<AreaChoice | null> {
  if (!slug) return null;
  return (await listAreaChoices()).find((a) => a.slug === slug) ?? null;
}
