import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { InvalidPhoneError, normalizePhone } from "@/lib/auth/phone";

/**
 * Vendors, for the people who have to add one.
 *
 * A vendor **is** a `Store` in this schema. There is no separate vendor
 * table and there should not be one: what physically holds the stock an
 * order line reserved is the store frozen onto `OrderLine.storeId`, so
 * "the vendor for these items" and "the store they came from" are the
 * same fact, and modelling them twice would mean keeping two rows in
 * agreement about one shop.
 *
 * This module exists because the WhatsApp number was previously only
 * settable from a script (`npm run vendors:whatsapp`). That was honest
 * for one column on rows that change once a year, and it stopped being
 * honest the moment a failed vendor notification on the order page said
 * "no WhatsApp number on file" and the fix was to open a terminal. The
 * script still works and is still the right tool for a deploy script;
 * this is the same two columns for the person reading the order page.
 *
 * **Adding a store is not a cosmetic act**, and that is the whole reason
 * the write functions below are shaped the way they are — see
 * `createVendor` and `setVendorActive`.
 */

/** ---- Reads --------------------------------------------------------------- */

export interface AdminVendorRow {
  id: string;
  code: string;
  name: string;
  /** Who to ask for. Falls back to `name` in the vendor's own message. */
  contactName: string | null;
  /** Where new-order messages go. Null means they are not being sent. */
  whatsappPhone: string | null;
  isActive: boolean;
  /** The warehouse a `SCHEDULED` line falls back to when nothing is near. */
  isDefault: boolean;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  baseEtaMinutes: number;
  serviceAreaName: string | null;
  /**
   * How many variants this store holds tracked stock for.
   *
   * On the page this is not trivia: a store with none of it cannot
   * actually serve a tracked line, and activating it anyway makes it the
   * nearest-in-radius store for every address it covers — which turns
   * those customers' checkouts into "no longer in stock at your delivery
   * address". See `setVendorActive`.
   */
  inventoryItemCount: number;
  /** Vendor legs still waiting on this store to dispatch. */
  outstandingFulfilments: number;
}

export async function listVendors(): Promise<AdminVendorRow[]> {
  const stores = await db.store.findMany({
    /* Active first, then by code: the ones doing work belong at the top,
       and a retired store is still listed because it is still named on
       past orders. */
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      contactName: true,
      whatsappPhone: true,
      isActive: true,
      isDefault: true,
      lat: true,
      lng: true,
      serviceRadiusKm: true,
      baseEtaMinutes: true,
      serviceArea: { select: { name: true } },
      _count: { select: { inventoryItems: true } },
    },
  });

  /* Outstanding legs are counted in one grouped query rather than a
     relation count per store: `OrderFulfilment.storeId` is deliberately
     not a foreign key (it is a snapshot — see the model comment), so
     there is no relation for Prisma to count through. */
  const pending = await db.orderFulfilment.groupBy({
    by: ["storeId"],
    where: { status: "PENDING" },
    _count: { _all: true },
  });
  const pendingByStore = new Map(pending.map((row) => [row.storeId, row._count._all]));

  return stores.map((store) => ({
    id: store.id,
    code: store.code,
    name: store.name,
    contactName: store.contactName,
    whatsappPhone: store.whatsappPhone,
    isActive: store.isActive,
    isDefault: store.isDefault,
    lat: store.lat,
    lng: store.lng,
    serviceRadiusKm: store.serviceRadiusKm,
    baseEtaMinutes: store.baseEtaMinutes,
    serviceAreaName: store.serviceArea?.name ?? null,
    inventoryItemCount: store._count.inventoryItems,
    outstandingFulfilments: pendingByStore.get(store.id) ?? 0,
  }));
}

/**
 * The service areas a new store could be attached to.
 *
 * `Store.serviceAreaId` is `@unique` — one store per area — so an area
 * another store already claims is not offered. Filtering here rather than
 * letting the form offer it and the database reject it means the operator
 * never has to interpret a unique-constraint error.
 */
export async function listUnclaimedServiceAreas(): Promise<{ id: string; name: string }[]> {
  return db.serviceArea.findMany({
    where: { isActive: true, store: { is: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** ---- Validation (pure) --------------------------------------------------- */

/** Anything the operator typed that cannot become a store. */
export class InvalidVendorError extends Error {
  constructor(
    message: string,
    /** Field → message, so the form can attach it to the right input. */
    readonly fields: Record<string, string>,
  ) {
    super(message);
    this.name = "InvalidVendorError";
  }
}

export interface VendorInput {
  code: string;
  name: string;
  contactName?: string | null;
  whatsappPhone?: string | null;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  baseEtaMinutes: number;
  serviceAreaId?: string | null;
}

export interface ValidatedVendor {
  code: string;
  name: string;
  contactName: string | null;
  whatsappPhone: string | null;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  baseEtaMinutes: number;
  serviceAreaId: string | null;
}

/** `DEL-JNK` — what the seeded stores use, and what inventory screens show. */
const CODE_PATTERN = /^[A-Z0-9]{2,8}(-[A-Z0-9]{2,8})*$/;

/**
 * India's bounding box, roughly, including the islands.
 *
 * Not a nicety. `resolveServiceability` picks the nearest store *within
 * its own radius* by haversine distance, so a latitude and longitude
 * typed the wrong way round — 77.08, 28.62 instead of 28.62, 77.08 — puts
 * the store in the Indian Ocean, where it is inside nobody's radius and
 * silently serves no orders at all. A transposed pair is the single most
 * likely typo on this form and the hardest to spot afterwards, so it is
 * refused here rather than discovered as an inexplicably idle store.
 */
const LAT_RANGE = { min: 6, max: 37 };
const LNG_RANGE = { min: 68, max: 98 };

/**
 * Turns what the form submitted into a row, or throws with per-field
 * messages.
 *
 * Pure and exported so it can be unit-tested without a database, the way
 * `validateOfflinePayment` (`src/lib/data/orders.ts`) is — the arithmetic
 * and the bounds are the part worth testing, and neither needs Postgres.
 */
export function validateVendor(input: VendorInput): ValidatedVendor {
  const fields: Record<string, string> = {};

  const code = input.code.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    fields.code = "Use letters, numbers and hyphens, like DEL-JNK.";
  }

  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    fields.name = "Give the store a name between 2 and 80 characters.";
  }

  const contactName = input.contactName?.trim() || null;
  if (contactName && contactName.length > 80) {
    fields.contactName = "Keep the contact name under 80 characters.";
  }

  let whatsappPhone: string | null = null;
  if (input.whatsappPhone?.trim()) {
    try {
      whatsappPhone = normalizePhone(input.whatsappPhone);
    } catch (error) {
      fields.whatsappPhone =
        error instanceof InvalidPhoneError
          ? error.message
          : "Enter a valid 10-digit Indian mobile number.";
    }
  }

  if (!Number.isFinite(input.lat) || input.lat < LAT_RANGE.min || input.lat > LAT_RANGE.max) {
    fields.lat = `Latitude should be between ${LAT_RANGE.min} and ${LAT_RANGE.max} — Delhi is about 28.6.`;
  }
  if (!Number.isFinite(input.lng) || input.lng < LNG_RANGE.min || input.lng > LNG_RANGE.max) {
    fields.lng = `Longitude should be between ${LNG_RANGE.min} and ${LNG_RANGE.max} — Delhi is about 77.1.`;
  }

  if (
    !Number.isFinite(input.serviceRadiusKm) ||
    input.serviceRadiusKm <= 0 ||
    input.serviceRadiusKm > 50
  ) {
    fields.serviceRadiusKm = "A delivery radius between 0.5 and 50 km.";
  }

  if (
    !Number.isInteger(input.baseEtaMinutes) ||
    input.baseEtaMinutes < 5 ||
    input.baseEtaMinutes > 600
  ) {
    fields.baseEtaMinutes = "A pick-and-pack time between 5 and 600 minutes.";
  }

  if (Object.keys(fields).length > 0) {
    throw new InvalidVendorError("Some fields need attention", fields);
  }

  return {
    code,
    name,
    contactName,
    whatsappPhone,
    lat: input.lat,
    lng: input.lng,
    serviceRadiusKm: input.serviceRadiusKm,
    baseEtaMinutes: input.baseEtaMinutes,
    serviceAreaId: input.serviceAreaId?.trim() || null,
  };
}

/** ---- Writes -------------------------------------------------------------- */

/** The code or the service area is already taken. */
export class VendorConflictError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string>,
  ) {
    super(message);
    this.name = "VendorConflictError";
  }
}

export class VendorNotFoundError extends Error {
  constructor() {
    super("No such vendor");
    this.name = "VendorNotFoundError";
  }
}

/**
 * Adds a vendor, **switched off**.
 *
 * `isActive: false` is not a draft state invented for tidiness, and it is
 * not overridable from the form. Every serviceability read in this app
 * filters on `isActive: true` (`reserveStockForOrder`,
 * `src/lib/data/inventory.ts`; `resolveServiceability`, `src/lib/geo.ts`;
 * the service-area reads), and `resolveServiceability` picks the
 * **nearest active store within its own radius**. So the moment a store
 * is active it starts winning that contest for every address it covers —
 * and a store with no `InventoryItem` rows cannot satisfy a tracked line,
 * which makes `reserveVariantStock` fail and turns those customers'
 * checkouts into "Some items in this basket are no longer in stock at
 * your delivery address".
 *
 * A new store has, by definition, no stock. Creating it active would
 * therefore break checkout for a radius of addresses the instant it was
 * saved, and the person who saved it would have no reason to connect the
 * two. Inactive, it is genuinely inert: nothing reads it, no promise
 * changes, no order routes to it. Stock it through the inventory screens,
 * then activate it — `setVendorActive` is the deliberate second act, and
 * it asks about exactly this.
 *
 * One thing this cannot protect against, and the page says so: a store
 * added here is not in `prisma/seed.ts`, and that script deactivates
 * every store whose code it does not know. Running `npm run db:seed`
 * against this database will switch a hand-added vendor off again. Add it
 * to `STORES` there as well once it is real.
 */
export async function createVendor(input: VendorInput): Promise<AdminVendorRow> {
  const vendor = validateVendor(input);

  try {
    const created = await db.store.create({
      data: {
        code: vendor.code,
        name: vendor.name,
        contactName: vendor.contactName,
        whatsappPhone: vendor.whatsappPhone,
        lat: vendor.lat,
        lng: vendor.lng,
        serviceRadiusKm: vendor.serviceRadiusKm,
        baseEtaMinutes: vendor.baseEtaMinutes,
        serviceAreaId: vendor.serviceAreaId,
        /* See the doc comment. Deliberately not taken from the caller. */
        isActive: false,
        /* Nor this. A second default store makes the `SCHEDULED` fallback
           pick whichever `findFirst` returns — see `Store.isDefault` —
           and choosing the warehouse the whole country ships from is not
           a thing to do by accident on an add form. */
        isDefault: false,
      },
      select: { id: true },
    });

    const row = (await listVendors()).find((candidate) => candidate.id === created.id);
    /* Cannot miss: just created in this request. */
    if (!row) throw new Error("Vendor vanished immediately after being created");
    return row;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = error.meta?.target as string[] | undefined;
      if (target?.some((column) => column.includes("serviceArea"))) {
        throw new VendorConflictError("That area already has a store", {
          serviceAreaId: "Another store already serves this area.",
        });
      }
      throw new VendorConflictError("That code is already in use", {
        code: `A store with the code ${vendor.code} already exists.`,
      });
    }
    throw error;
  }
}

/**
 * Sets the two columns a WhatsApp notification actually needs.
 *
 * Separate from `createVendor` because it is a different act with
 * different stakes: filling in a missing number is the fix for a failed
 * vendor notification and should be one field and one button, not a form
 * that re-asks for coordinates. Nothing here can change where a store is,
 * how far it reaches, or whether it is active.
 *
 * Changing a number does **not** rewrite history.
 * `OrderFulfilment.vendorPhone` snapshots the number each past order's
 * message was addressed to, so the record of who was actually messaged
 * survives. A *retry* from the order page reads the live number, which is
 * the whole point of coming here after a failure.
 */
export async function updateVendorContact(input: {
  id: string;
  /** `null` clears it, which stops vendor messages being sent at all. */
  whatsappPhone: string | null;
  contactName: string | null;
}): Promise<AdminVendorRow> {
  const fields: Record<string, string> = {};

  let whatsappPhone: string | null = null;
  if (input.whatsappPhone?.trim()) {
    try {
      whatsappPhone = normalizePhone(input.whatsappPhone);
    } catch (error) {
      fields.whatsappPhone =
        error instanceof InvalidPhoneError
          ? error.message
          : "Enter a valid 10-digit Indian mobile number.";
    }
  }

  const contactName = input.contactName?.trim() || null;
  if (contactName && contactName.length > 80) {
    fields.contactName = "Keep the contact name under 80 characters.";
  }

  if (Object.keys(fields).length > 0) {
    throw new InvalidVendorError("Some fields need attention", fields);
  }

  const existing = await db.store.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!existing) throw new VendorNotFoundError();

  await db.store.update({
    where: { id: input.id },
    data: { whatsappPhone, contactName },
  });

  const row = (await listVendors()).find((candidate) => candidate.id === input.id);
  if (!row) throw new VendorNotFoundError();
  return row;
}

/** Activating a store that holds no stock, without having said so. */
export class EmptyStoreActivationError extends Error {
  constructor(readonly name: string) {
    super(
      `${name} holds no tracked stock. Activating it makes it the nearest store for every address in its radius, and those customers' baskets will fail to reserve. Stock it first, or confirm you want it active anyway.`,
    );
    this.name = "EmptyStoreActivationError";
  }
}

/**
 * Switches a vendor on or off.
 *
 * **Off** is always allowed and is always safe: nothing reads an inactive
 * store, so deactivating one simply stops it being chosen for new orders.
 * Orders already routed to it keep their frozen `OrderLine.storeId` and
 * its `OrderFulfilment` snapshot, so past orders and outstanding legs are
 * unaffected — which is why this is a flag rather than a delete, and why
 * the page warns about outstanding legs rather than refusing.
 *
 * **On** is the act with consequences, and it is guarded by
 * acknowledgement rather than by refusal. A store with no `InventoryItem`
 * rows becomes the nearest-in-radius store for every address it covers
 * the moment it is active, and then fails to reserve for all of them —
 * see `createVendor` for the chain. Refusing outright would block an
 * operator who is about to receive stock within the hour and knows
 * exactly what they are doing; letting it through silently would lose
 * orders nobody can explain. So the empty case throws
 * `EmptyStoreActivationError` unless the caller passes
 * `acknowledgeEmptyStock`, which the UI turns into a question with the
 * consequence written out — the same shape as the "I have received
 * {total} in full" confirmation on the offline-payment form.
 */
export async function setVendorActive(input: {
  id: string;
  isActive: boolean;
  acknowledgeEmptyStock?: boolean;
}): Promise<AdminVendorRow> {
  const existing = await db.store.findUnique({
    where: { id: input.id },
    select: { id: true, name: true, _count: { select: { inventoryItems: true } } },
  });
  if (!existing) throw new VendorNotFoundError();

  if (input.isActive && existing._count.inventoryItems === 0 && !input.acknowledgeEmptyStock) {
    throw new EmptyStoreActivationError(existing.name);
  }

  await db.store.update({ where: { id: input.id }, data: { isActive: input.isActive } });

  const row = (await listVendors()).find((candidate) => candidate.id === input.id);
  if (!row) throw new VendorNotFoundError();
  return row;
}
