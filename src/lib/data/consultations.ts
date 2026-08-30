import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  ConsultMode as DbMode,
  ConsultSlot as DbSlot,
  ConsultStatus as DbStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { maskPhone } from "@/lib/auth/phone";
import type {
  ConsultMode,
  ConsultRequestView,
  ConsultSlot,
  ConsultStatus,
} from "@/lib/types/consult";

/**
 * Consultation requests.
 *
 * The write side of the first slice of module 6. A row here is demand, not
 * a booking: see the model comment in `schema.prisma` for why nothing in
 * this file reserves anyone's time.
 */

/** ---- Mapping ------------------------------------------------------------
 * Both directions are written out rather than derived with `toUpperCase()`.
 * A `Record` keyed on the union is exhaustive, so adding a mode to the
 * schema fails the build here instead of falling through to `undefined` at
 * the moment a customer submits the form.
 */

const TO_DB_MODE: Record<ConsultMode, DbMode> = {
  video: "VIDEO",
  site_visit: "SITE_VISIT",
};

const FROM_DB_MODE: Record<DbMode, ConsultMode> = {
  VIDEO: "video",
  SITE_VISIT: "site_visit",
};

const TO_DB_SLOT: Record<ConsultSlot, DbSlot> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  evening: "EVENING",
};

const FROM_DB_SLOT: Record<DbSlot, ConsultSlot> = {
  MORNING: "morning",
  AFTERNOON: "afternoon",
  EVENING: "evening",
};

const FROM_DB_STATUS: Record<DbStatus, ConsultStatus> = {
  REQUESTED: "requested",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/** ---- Reference codes ---------------------------------------------------- */

/**
 * No O, 0, I, 1, S or 5. This code is read down a phone line and written
 * on the back of a card, and those are the pairs that come back wrong.
 */
const ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789";
const REFERENCE_LENGTH = 6;

function generateReference(): string {
  let out = "";
  /* `randomInt`, not `Math.random`: the reference is the only thing a
     customer quotes to identify their request, so it must not be
     guessable from another one issued the same second. */
  for (let i = 0; i < REFERENCE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `QC-${out}`;
}

/** 29^6 ≈ 594M codes; a handful of retries covers any realistic volume. */
const REFERENCE_ATTEMPTS = 5;

/** ---- Reads -------------------------------------------------------------- */

/**
 * How many requests this number has made since `since`.
 *
 * Keyed on the phone rather than the IP for the same reason the OTP
 * limiter is: the cost being controlled is a human being called back, and
 * that survives an IP change.
 */
export function countRequestsSince(phone: string, since: Date): Promise<number> {
  return db.consultRequest.count({ where: { phone, createdAt: { gte: since } } });
}

const VIEW_QUERY = {
  select: {
    reference: true,
    mode: true,
    status: true,
    phone: true,
    preferredDate: true,
    preferredSlot: true,
    createdAt: true,
    area: { select: { name: true } },
  },
} as const;

type RequestRow = Awaited<
  ReturnType<typeof db.consultRequest.findMany<typeof VIEW_QUERY>>
>[number];

function toView(row: RequestRow): ConsultRequestView {
  return {
    reference: row.reference,
    mode: FROM_DB_MODE[row.mode],
    status: FROM_DB_STATUS[row.status],
    /* Masked even back to the person who just typed it: this response is
       rendered into a shared device's page and pasted into support
       tickets, exactly as `/api/v1/me` is. */
    phone: maskPhone(row.phone),
    /* A `@db.Date` comes back as midnight UTC, so slicing the ISO string
       is the calendar day the customer chose — no timezone shift to undo. */
    preferredDate: row.preferredDate ? row.preferredDate.toISOString().slice(0, 10) : null,
    preferredSlot: row.preferredSlot ? FROM_DB_SLOT[row.preferredSlot] : null,
    areaName: row.area?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The operations queue: newest first, and open requests are what matter. */
export async function listConsultRequests(
  limit = 50,
): Promise<ConsultRequestView[]> {
  const rows = await db.consultRequest.findMany({
    ...VIEW_QUERY,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map(toView);
}

/** ---- Writes ------------------------------------------------------------- */

export interface NewConsultRequest {
  mode: ConsultMode;
  name: string;
  /** Already E.164 — `normalizePhone` runs at the edge, not here. */
  phone: string;
  email?: string;
  userId?: string;
  /** Area slug, checked against the live list before it gets here. */
  areaSlug?: string;
  pincode?: string;
  /** Category slug from the catalogue. Unknown slugs are dropped, not rejected. */
  categorySlug?: string;
  notes?: string;
  /** `YYYY-MM-DD`, validated against the horizon at the edge. */
  preferredDate?: string;
  preferredSlot?: ConsultSlot;
}

/**
 * Records a request and returns what the customer is shown.
 *
 * The area and category are resolved to ids here rather than trusted as
 * foreign keys from the client — a slug that no longer exists becomes
 * `null` on the row instead of a 500 from a broken constraint, because a
 * customer asking for a category we retired last week is still a lead.
 */
export async function createConsultRequest(
  input: NewConsultRequest,
): Promise<ConsultRequestView> {
  const [area, category] = await Promise.all([
    input.areaSlug
      ? db.serviceArea.findUnique({ where: { slug: input.areaSlug }, select: { id: true } })
      : null,
    input.categorySlug
      ? db.category.findUnique({ where: { slug: input.categorySlug }, select: { id: true } })
      : null,
  ]);

  const data = {
    mode: TO_DB_MODE[input.mode],
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    userId: input.userId ?? null,
    areaId: area?.id ?? null,
    pincode: input.pincode ?? null,
    categoryId: category?.id ?? null,
    notes: input.notes ?? null,
    /* Midnight UTC on the chosen day. The column is `@db.Date`, so the
       time is discarded — what must not happen is constructing it from a
       local timezone, which would land on the previous day east of UTC. */
    preferredDate: input.preferredDate ? new Date(`${input.preferredDate}T00:00:00Z`) : null,
    preferredSlot: input.preferredSlot ? TO_DB_SLOT[input.preferredSlot] : null,
  };

  /* Retry on a reference collision rather than pre-checking for one: the
     check-then-insert version is a race that two concurrent submissions
     can both pass, and the unique index is the only thing that actually
     decides. P2002 is Prisma's unique-constraint violation. */
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      const row = await db.consultRequest.create({
        data: { ...data, reference: generateReference() },
        ...VIEW_QUERY,
      });
      return toView(row);
    } catch (error) {
      const collided =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        /* Only a reference clash is retryable. Any other unique index
           failing means something different is wrong, and spinning five
           times over it would just delay the real error. */
        (error.meta?.target as string[] | undefined)?.includes("reference");

      if (!collided) throw error;
    }
  }

  throw new Error("Could not allocate a consultation reference");
}
