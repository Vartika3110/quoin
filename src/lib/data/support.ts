import { Prisma } from "@prisma/client";
import type { SupportCategory as DbCategory, SupportStatus as DbStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { maskPhone } from "@/lib/auth/phone";
import { REFERENCE_ATTEMPTS, generateReference } from "@/lib/reference";

/**
 * Help & Support requests.
 *
 * A row here is a person asking Quoin something — never a change to an
 * order, a booking or a payment. `orderId`/`bookingId` are read-only
 * pointers a customer can attach for context, resolved from a reference
 * they own at write time (see `createSupportRequest`); nothing in this
 * module writes to `Order` or `ServiceBooking`.
 */

const REFERENCE_PREFIX = "QH";

/** ---- Category mapping ----------------------------------------------------
 * The URL contract (`?category=orders`, the select on the contact form)
 * is lower-case slugs; the column is the Prisma enum. Both directions are
 * written out rather than derived with case conversion, so a category
 * added to the schema without a matching slug here fails the build
 * instead of silently mapping to `undefined` at submit time.
 */
export const SUPPORT_CATEGORY_SLUGS = [
  "orders",
  "payments",
  "delivery",
  "products",
  "projects",
  "services",
  "parcha",
  "account",
] as const;

export type SupportCategorySlug = (typeof SUPPORT_CATEGORY_SLUGS)[number];

const TO_DB_CATEGORY: Record<SupportCategorySlug, DbCategory> = {
  orders: "ORDERS",
  payments: "PAYMENTS",
  delivery: "DELIVERY",
  products: "PRODUCTS",
  projects: "PROJECTS",
  services: "SERVICES",
  parcha: "PARCHA",
  account: "ACCOUNT",
};

const FROM_DB_CATEGORY: Record<DbCategory, SupportCategorySlug> = {
  ORDERS: "orders",
  PAYMENTS: "payments",
  DELIVERY: "delivery",
  PRODUCTS: "products",
  PROJECTS: "projects",
  SERVICES: "services",
  PARCHA: "parcha",
  ACCOUNT: "account",
};

/**
 * A query-string value into a category slug, or `undefined` for anything
 * that is not one — never an error. Matches `parseOrderStatusFilter`
 * (`src/lib/data/admin-orders.ts`): a stale or hand-edited `?category=`
 * degrades to "no filter" rather than a 400 on a page load.
 */
export function parseSupportCategory(value: string | undefined): SupportCategorySlug | undefined {
  return value && (SUPPORT_CATEGORY_SLUGS as readonly string[]).includes(value)
    ? (value as SupportCategorySlug)
    : undefined;
}

/**
 * The subject line the contact form pre-fills, from whatever the customer
 * arrived with. Pure, so the page, the API's default (a client that skips
 * the form entirely) and the test in `tests/support.test.mts` all read
 * from the same rule rather than three copies of this sentence.
 *
 * An order outranks a booking when both are somehow present — the query
 * contract never sends both at once, but a made-up URL might, and a
 * request has to be about one thing.
 */
export function defaultSubject(input: {
  orderReference?: string;
  bookingReference?: string;
  /** `"issue"` from `?type=issue` — anything else reads as a plain question. */
  type?: string;
}): string {
  if (input.orderReference) {
    return input.type === "issue"
      ? `Report an issue with order ${input.orderReference}`
      : `Help with order ${input.orderReference}`;
  }
  if (input.bookingReference) {
    return `Help with booking ${input.bookingReference}`;
  }
  return "";
}

/** ---- Errors --------------------------------------------------------------- */

/**
 * The `orderReference` or `bookingReference` on a new request did not
 * resolve to a row the caller owns — because it does not exist, or
 * because it belongs to someone else. One error for both cases, on
 * purpose: telling a customer "that order belongs to another account"
 * confirms the reference is real, which is exactly the confirmation a
 * guessed reference must not get. See `requireStaff`'s own 404 for the
 * same reasoning applied to a different kind of guess.
 */
export class SupportReferenceNotFoundError extends Error {
  constructor() {
    super("That reference could not be found on your account.");
    this.name = "SupportReferenceNotFoundError";
  }
}

export class SupportRateLimitedError extends Error {
  constructor() {
    super(
      "You already have several requests open. Someone from Quoin will get back to you on those first.",
    );
    this.name = "SupportRateLimitedError";
  }
}

export class SupportRequestNotFoundError extends Error {
  constructor(reference: string) {
    super(`No such support request: ${reference}`);
    this.name = "SupportRequestNotFoundError";
  }
}

/** ---- Rate limit ------------------------------------------------------------
 * Five open conversations a day from one account is already generous for
 * a person; past that, more requests do not get anyone answered faster —
 * see `MAX_REQUESTS_PER_DAY` in `src/app/api/v1/consultations/route.ts`
 * for the same number applied to a call-back request.
 */
const MAX_REQUESTS_PER_DAY = 5;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** ---- Status vocabulary ------------------------------------------------------
 * Shared between the customer's "Your requests" list and the admin queue,
 * matching `ORDER_STATUS_LABEL`/`ORDER_STATUS_TONE` in
 * `src/lib/data/order-history.ts` — one place names what a status means,
 * rather than each screen inventing its own words for the same enum.
 */
export const SUPPORT_STATUS_LABEL: Record<DbStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};

export const SUPPORT_STATUS_TONE: Record<DbStatus, "accent" | "info" | "success"> = {
  OPEN: "accent",
  IN_PROGRESS: "info",
  RESOLVED: "success",
};

const SUPPORT_STATUS_VALUES = new Set(Object.keys(SUPPORT_STATUS_LABEL));

/**
 * A query-string status into the enum, or `undefined` for anything that
 * is not one — same "stale filter degrades silently" rule as
 * `parseSupportCategory` above. Shared by the admin queue's page and its
 * `GET` route rather than defined twice, the one thing `parseOrderStatusFilter`
 * did not have to be since `/admin/orders` has no separate list API.
 */
export function parseSupportStatusFilter(value: string | undefined): DbStatus | undefined {
  return value && SUPPORT_STATUS_VALUES.has(value) ? (value as DbStatus) : undefined;
}

/** ---- Customer views -------------------------------------------------------- */

export interface SupportRequestView {
  reference: string;
  category: SupportCategorySlug;
  status: DbStatus;
  subject: string;
  message: string;
  orderReference: string | null;
  bookingReference: string | null;
  createdAt: string;
}

const CUSTOMER_SELECT = {
  reference: true,
  category: true,
  status: true,
  subject: true,
  message: true,
  createdAt: true,
  order: { select: { reference: true } },
  booking: { select: { reference: true } },
} as const;

type CustomerRow = Awaited<
  ReturnType<typeof db.supportRequest.findMany<{ select: typeof CUSTOMER_SELECT }>>
>[number];

function toCustomerView(row: CustomerRow): SupportRequestView {
  return {
    reference: row.reference,
    category: FROM_DB_CATEGORY[row.category],
    status: row.status,
    subject: row.subject,
    message: row.message,
    orderReference: row.order?.reference ?? null,
    bookingReference: row.booking?.reference ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface NewSupportRequest {
  category: SupportCategorySlug;
  subject: string;
  message: string;
  orderReference?: string;
  bookingReference?: string;
}

/**
 * Records a request, after checking the two things a customer's own words
 * cannot be trusted for: that any reference they attached is genuinely
 * theirs, and that they have not already filed several today.
 *
 * The rate check runs before the reference lookups so a account already
 * over the limit never spends a query proving whose order it typed in.
 */
export async function createSupportRequest(
  userId: string,
  input: NewSupportRequest,
): Promise<SupportRequestView> {
  const recent = await db.supportRequest.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) } },
  });
  if (recent >= MAX_REQUESTS_PER_DAY) throw new SupportRateLimitedError();

  const [order, booking] = await Promise.all([
    input.orderReference
      ? db.order.findUnique({
          where: { reference: input.orderReference },
          select: { id: true, userId: true },
        })
      : null,
    input.bookingReference
      ? db.serviceBooking.findUnique({
          where: { reference: input.bookingReference },
          select: { id: true, userId: true },
        })
      : null,
  ]);

  if (input.orderReference && order?.userId !== userId) {
    throw new SupportReferenceNotFoundError();
  }
  if (input.bookingReference && booking?.userId !== userId) {
    throw new SupportReferenceNotFoundError();
  }

  /* Retry on a reference collision rather than pre-checking for one — see
     `createConsultRequest` in `src/lib/data/consultations.ts` for why the
     unique index, not a prior read, is what actually decides this. */
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      const row = await db.supportRequest.create({
        data: {
          reference: generateReference(REFERENCE_PREFIX),
          userId,
          category: TO_DB_CATEGORY[input.category],
          subject: input.subject,
          message: input.message,
          orderId: order?.id ?? null,
          bookingId: booking?.id ?? null,
        },
        select: CUSTOMER_SELECT,
      });
      return toCustomerView(row);
    } catch (error) {
      const collided =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.includes("reference");
      if (!collided) throw error;
    }
  }

  throw new Error("Could not allocate a support reference");
}

/** One customer's own requests, newest first. */
export async function listSupportRequestsForUser(userId: string): Promise<SupportRequestView[]> {
  const rows = await db.supportRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: CUSTOMER_SELECT,
  });
  return rows.map(toCustomerView);
}

/** ---- Staff views ------------------------------------------------------------ */

export interface AdminSupportRow {
  reference: string;
  category: SupportCategorySlug;
  status: DbStatus;
  subject: string;
  message: string;
  customerName: string | null;
  /** Masked, matching every other place a customer's number reaches a
      staff screen (`maskPhone`, `src/lib/auth/phone.ts`). */
  customerPhone: string | null;
  customerEmail: string | null;
  orderReference: string | null;
  bookingReference: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const ADMIN_SELECT = {
  reference: true,
  category: true,
  status: true,
  subject: true,
  message: true,
  createdAt: true,
  resolvedAt: true,
  user: { select: { name: true, phone: true, email: true } },
  order: { select: { reference: true } },
  booking: { select: { reference: true } },
} as const;

type AdminRow = Awaited<
  ReturnType<typeof db.supportRequest.findMany<{ select: typeof ADMIN_SELECT }>>
>[number];

function toAdminRow(row: AdminRow): AdminSupportRow {
  return {
    reference: row.reference,
    category: FROM_DB_CATEGORY[row.category],
    status: row.status,
    subject: row.subject,
    message: row.message,
    customerName: row.user.name,
    customerPhone: row.user.phone ? maskPhone(row.user.phone) : null,
    customerEmail: row.user.email,
    orderReference: row.order?.reference ?? null,
    bookingReference: row.booking?.reference ?? null,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

const ADMIN_PAGE_SIZE = 20;

export interface AdminSupportPage {
  items: AdminSupportRow[];
  page: number;
  totalPages: number;
  total: number;
}

/**
 * The support queue. Open and in-progress requests sort before resolved
 * ones within a page, same idea as `listConsultRequests` — a queue is for
 * what still needs doing, and a page of all-resolved rows is the least
 * useful page to land on first.
 */
export async function listSupportRequestsForStaff(input: {
  status?: DbStatus;
  page?: number;
}): Promise<AdminSupportPage> {
  const page = Math.max(1, Math.trunc(input.page ?? 1) || 1);
  const where = input.status ? { status: input.status } : {};

  const [total, rows] = await Promise.all([
    db.supportRequest.count({ where }),
    db.supportRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: ADMIN_SELECT,
    }),
  ]);

  return {
    items: rows.map(toAdminRow),
    page,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
    total,
  };
}

/** One request, for the admin detail read. */
export async function getSupportRequestForStaff(reference: string): Promise<AdminSupportRow | null> {
  const row = await db.supportRequest.findUnique({
    where: { reference },
    select: ADMIN_SELECT,
  });
  return row ? toAdminRow(row) : null;
}

/**
 * Moves a request to a new status.
 *
 * `resolvedAt` is derived from `status` here rather than left for a
 * caller to set separately: it is set the moment staff move a request to
 * `RESOLVED` and cleared the moment they move it away again, so it can
 * never point at a request that is not currently resolved.
 */
export async function updateSupportStatus(
  reference: string,
  status: DbStatus,
): Promise<AdminSupportRow> {
  try {
    const row = await db.supportRequest.update({
      where: { reference },
      data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
      select: ADMIN_SELECT,
    });
    return toAdminRow(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new SupportRequestNotFoundError(reference);
    }
    throw error;
  }
}
