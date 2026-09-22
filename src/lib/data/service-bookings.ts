import { Prisma } from "@prisma/client";
import type {
  ConsultSlot as DbSlot,
  ServiceBookingKind,
  ServiceBookingStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { REFERENCE_ATTEMPTS, generateReference } from "@/lib/reference";
import { notify } from "@/lib/data/notifications";
import { resolveAdminPage } from "@/lib/data/admin-metrics";
import { getServiceBySlug } from "@/lib/data/services";
import {
  bookingTransitionProblem,
  canTransitionBooking,
  initialBookingStatus,
} from "@/lib/services/booking-status";
import {
  BOOKING_HORIZON_DAYS,
  formatBookingWhen,
  validatePreferredDay,
} from "@/lib/services/booking-helpers";
import {
  PROJECT_KIND_FROM_DB,
  PROJECT_KIND_TO_DB,
  fromCalendarDate,
  toCalendarDate,
  type ProjectKind,
} from "@/lib/data/projects";
import type { ConsultSlot } from "@/lib/types/consult";
import { formatPrice, type Paise } from "@/lib/types/catalog";

/**
 * Service bookings.
 *
 * The write side has the same two rules `src/lib/data/orders.ts` runs on,
 * adapted to a job nobody can price sight-unseen instead of a basket that
 * can:
 *
 * **The browser never states a price.** It sends a slug, a kind and a
 * scope; `quotePaise` exists on the row only because a *staff member*
 * typed it, through `staffUpdate`, and nothing here ever reads a quote out
 * of a request body.
 *
 * **Nothing here takes money.** There is no Razorpay order, no capture, no
 * `Payment` row — see the model comment on `ServiceBooking` and
 * `AGENTS.md` for this slice. A booking or a quote is a conversation
 * Quoin has started with a customer; the money, if any, changes hands
 * later and offline, exactly as `recordOfflinePayment` already handles
 * for orders.
 *
 * The state machine itself lives in `booking-status.ts` and is imported,
 * never re-derived — this module's job is deciding *what a row needs on
 * it* before a transition is legal, not which transitions exist.
 */

const REFERENCE_PREFIX = "QS";

/** Ten open requests a day is generous for a real customer and cheap to
    abuse for anyone else — the same shape as `OTP_MAX_REQUESTS_PER_WINDOW`
    and the consultation limiter, sized up because a service booking is a
    considered decision, not a retry-until-it-works code entry. */
const MAX_BOOKINGS_PER_DAY = 10;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** ---- Slot mapping ---------------------------------------------------------
 * Same shape as `TO_DB_SLOT`/`FROM_DB_SLOT` in `consultations.ts`, and not
 * imported from there: that pair is private to that module, and a booking
 * is not a consultation — sharing the map would couple two features that
 * only coincidentally use the same half-day windows.
 */

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

/** ---- Errors ---------------------------------------------------------------
 * One class per way a request can be refused, so a route can tell them
 * apart without parsing a message — and so `serviceBookingErrorCode` below
 * has something to switch on.
 */

export class ServiceNotFoundError extends Error {
  constructor(slug: string) {
    super(`"${slug}" is not a service Quoin books.`);
    this.name = "ServiceNotFoundError";
  }
}

export class ServiceBookingModeNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceBookingModeNotAllowedError";
  }
}

export class ServiceBookingScheduleRequiredError extends Error {
  constructor(message = "Pick a preferred day and time window to book this service.") {
    super(message);
    this.name = "ServiceBookingScheduleRequiredError";
  }
}

export class ServiceBookingScheduleInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceBookingScheduleInvalidError";
  }
}

export class ServiceBookingSiteRequiredError extends Error {
  constructor(message = "Add the site address — pick a saved one, or type it in.") {
    super(message);
    this.name = "ServiceBookingSiteRequiredError";
  }
}

export class ServiceBookingFilesNotFoundError extends Error {
  constructor(message = "One of those files did not finish uploading. Try again.") {
    super(message);
    this.name = "ServiceBookingFilesNotFoundError";
  }
}

/** Also covers "belongs to someone else" and "archived" — a customer
    picking a project id off their own account never needs to tell those
    apart from "does not exist". */
export class ServiceBookingProjectNotFoundError extends Error {
  constructor(message = "That project is not available.") {
    super(message);
    this.name = "ServiceBookingProjectNotFoundError";
  }
}

export class ServiceBookingAddressNotFoundError extends Error {
  constructor(message = "That address is not available.") {
    super(message);
    this.name = "ServiceBookingAddressNotFoundError";
  }
}

export class ServiceBookingRateLimitedError extends Error {
  constructor(
    message = "You already have several services booked with us. We'll work through those first.",
  ) {
    super(message);
    this.name = "ServiceBookingRateLimitedError";
  }
}

/** The reference does not resolve, or resolves to a row that is not this
    caller's. Deliberately one error for both — see `getBookingForUser`. */
export class ServiceBookingNotFoundError extends Error {
  constructor() {
    super("No such service booking");
    this.name = "ServiceBookingNotFoundError";
  }
}

export class ServiceBookingTransitionNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceBookingTransitionNotAllowedError";
  }
}

/** Another request already moved this booking between the read that
    decided a write was legal and the guarded write itself — same shape as
    `OrderStatusRaceError`. */
export class ServiceBookingRaceError extends Error {
  constructor() {
    super("This booking changed before this update could be applied. Reload and try again.");
    this.name = "ServiceBookingRaceError";
  }
}

/** What `bookingTransitionProblem` says is missing before a transition may
    happen — a quote with no amount, a schedule with no time. */
export class ServiceBookingFieldRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceBookingFieldRequiredError";
  }
}

export type ServiceBookingErrorCode = "bad_request" | "not_found" | "conflict" | "rate_limited";

/**
 * Maps this module's typed errors to the code the `/api/v1` envelope
 * wants — see `ApiErrorCode` in `src/lib/http.ts`. Duplicated as a plain
 * string union rather than imported, so this function (and the tests that
 * exercise it) never pull `next/server` into the import graph. A route
 * calls this first and falls through to its own catch-all for anything it
 * does not recognise, which is a real bug rather than a typed rejection.
 */
export function serviceBookingErrorCode(error: unknown): ServiceBookingErrorCode | null {
  if (
    error instanceof ServiceNotFoundError ||
    error instanceof ServiceBookingModeNotAllowedError ||
    error instanceof ServiceBookingScheduleRequiredError ||
    error instanceof ServiceBookingScheduleInvalidError ||
    error instanceof ServiceBookingSiteRequiredError ||
    error instanceof ServiceBookingFilesNotFoundError ||
    error instanceof ServiceBookingProjectNotFoundError ||
    error instanceof ServiceBookingAddressNotFoundError ||
    error instanceof ServiceBookingFieldRequiredError
  ) {
    return "bad_request";
  }
  if (error instanceof ServiceBookingNotFoundError) return "not_found";
  if (
    error instanceof ServiceBookingTransitionNotAllowedError ||
    error instanceof ServiceBookingRaceError
  ) {
    return "conflict";
  }
  if (error instanceof ServiceBookingRateLimitedError) return "rate_limited";
  return null;
}

/** ---- Writes: create -------------------------------------------------------- */

export interface NewServiceBookingInput {
  serviceSlug: string;
  kind: ServiceBookingKind;
  projectId?: string;
  newProjectName?: string;
  /** `YYYY-MM-DD`. */
  preferredDate?: string;
  preferredSlot?: ConsultSlot;
  addressId?: string;
  siteLine?: string;
  siteCity?: string;
  sitePincode?: string;
  projectKind?: ProjectKind;
  areaSqft?: number;
  requirements: string;
  notes?: string;
  fileIds?: string[];
}

export interface ServiceBookingResult {
  reference: string;
  status: ServiceBookingStatus;
}

/**
 * Writes a new booking or quote request.
 *
 * The address and project ownership checks, and the file-count check, all
 * run before the transaction — the same shape `createPendingOrder` checks
 * the delivery address in — because none of them can change *legality* of
 * the write once it starts; only creating a brand-new project has to be
 * inside the transaction, so a reference collision that rolls the booking
 * back also rolls back the project it would otherwise have orphaned. The
 * existing-project id is resolved once, outside the retry loop, precisely
 * so a rolled-back attempt's *new* project id is never carried into the
 * next attempt — each retry that needs a new project creates its own.
 */
export async function createServiceBooking(
  userId: string,
  input: NewServiceBookingInput,
): Promise<ServiceBookingResult> {
  const service = await getServiceBySlug(input.serviceSlug);
  if (!service) throw new ServiceNotFoundError(input.serviceSlug);

  const allowedKinds: ServiceBookingKind[] =
    service.bookingMode === "quote" ? ["QUOTE"] : ["BOOKING", "QUOTE"];
  if (!allowedKinds.includes(input.kind)) {
    throw new ServiceBookingModeNotAllowedError(
      service.bookingMode === "quote"
        ? `${service.name} is quoted against a real scope, not booked to a fixed day — request a quote instead.`
        : `"${input.kind}" is not a valid way to request ${service.name}.`,
    );
  }

  if (input.kind === "BOOKING" && (!input.preferredDate || !input.preferredSlot)) {
    throw new ServiceBookingScheduleRequiredError();
  }

  let preferredDateValue: Date | null = null;
  if (input.preferredDate) {
    if (!validatePreferredDay(input.preferredDate)) {
      throw new ServiceBookingScheduleInvalidError(
        `Pick a day within the next ${BOOKING_HORIZON_DAYS} days.`,
      );
    }
    preferredDateValue = toCalendarDate(input.preferredDate);
  }

  let verifiedProjectId: string | null = null;
  if (input.projectId) {
    const project = await db.project.findFirst({
      where: { id: input.projectId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!project) throw new ServiceBookingProjectNotFoundError();
    verifiedProjectId = project.id;
  }

  let siteLine: string;
  let siteCity: string;
  let sitePincode: string;

  if (input.addressId) {
    const address = await db.address.findFirst({
      where: { id: input.addressId, userId },
      select: { line1: true, line2: true, landmark: true, city: true, pincode: true },
    });
    if (!address) throw new ServiceBookingAddressNotFoundError();
    /* Snapshotted onto the booking, not read live at render time — the
       same reasoning as `Order.ship*`: a corrected address next month
       must not move where a visit already happened. */
    siteLine = [address.line1, address.line2, address.landmark].filter(Boolean).join(", ");
    siteCity = address.city;
    sitePincode = address.pincode;
  } else {
    siteLine = (input.siteLine ?? "").trim();
    if (!siteLine) throw new ServiceBookingSiteRequiredError();
    siteCity = (input.siteCity ?? "").trim();
    sitePincode = (input.sitePincode ?? "").trim();
  }

  const fileIds = input.fileIds ?? [];
  if (fileIds.length > 0) {
    const files = await db.storedFile.findMany({
      where: { id: { in: fileIds }, userId, status: "STORED", kind: "SERVICE_DOCUMENT" },
      select: { id: true },
    });
    if (files.length !== fileIds.length) throw new ServiceBookingFilesNotFoundError();
  }

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await db.serviceBooking.count({
    where: { userId, createdAt: { gte: since } },
  });
  if (recentCount >= MAX_BOOKINGS_PER_DAY) throw new ServiceBookingRateLimitedError();

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      const created = await db.$transaction(async (tx) => {
        let projectId = verifiedProjectId;
        if (!projectId && input.newProjectName) {
          const project = await tx.project.create({
            data: {
              userId,
              name: input.newProjectName,
              kind: input.projectKind ? PROJECT_KIND_TO_DB[input.projectKind] : "OTHER",
              location: siteCity,
            },
            select: { id: true },
          });
          projectId = project.id;
        }

        const status = initialBookingStatus(input.kind);

        const booking = await tx.serviceBooking.create({
          data: {
            reference: generateReference(REFERENCE_PREFIX),
            userId,
            projectId,
            serviceSlug: service.slug,
            serviceName: service.name,
            kind: input.kind,
            status,
            preferredDate: preferredDateValue,
            preferredSlot: input.preferredSlot ? TO_DB_SLOT[input.preferredSlot] : null,
            addressId: input.addressId ?? null,
            siteLine,
            siteCity,
            sitePincode,
            projectKind: input.projectKind ? PROJECT_KIND_TO_DB[input.projectKind] : null,
            areaSqft: input.areaSqft ?? null,
            requirements: input.requirements,
            notes: input.notes ?? "",
          },
          select: { id: true, reference: true, status: true },
        });

        await tx.serviceBookingStatusChange.create({
          data: { bookingId: booking.id, fromStatus: null, toStatus: status, actorUserId: userId },
        });

        if (fileIds.length > 0) {
          await tx.serviceBookingFile.createMany({
            data: fileIds.map((fileId) => ({ bookingId: booking.id, fileId })),
          });
        }

        return booking;
      });

      await notify({
        userId,
        kind: "SERVICE_BOOKED",
        title:
          input.kind === "BOOKING"
            ? `Service requested: ${service.name}`
            : `Quote requested: ${service.name}`,
        body:
          input.kind === "BOOKING"
            ? `Reference ${created.reference}. We'll call to confirm your visit day.`
            : `Reference ${created.reference}. We'll review your site details and send a quote.`,
        href: `/account/services/${created.reference}`,
        dedupeKey: `booking:${created.reference}:created`,
      });

      return { reference: created.reference, status: created.status };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      const target = error.meta?.target as string[] | undefined;
      /* Only a reference clash is retryable — see `createPendingOrder`. */
      if (!target?.includes("reference")) throw error;
    }
  }

  throw new Error("Could not allocate a service booking reference");
}

/** ---- Reads: customer -------------------------------------------------------- */

export interface ServiceBookingListItem {
  reference: string;
  serviceSlug: string;
  serviceName: string;
  kind: ServiceBookingKind;
  status: ServiceBookingStatus;
  preferredDate: string | null;
  preferredSlot: ConsultSlot | null;
  scheduledAt: string | null;
  quotePaise: Paise | null;
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
}

const LIST_SELECT = {
  reference: true,
  serviceSlug: true,
  serviceName: true,
  kind: true,
  status: true,
  preferredDate: true,
  preferredSlot: true,
  scheduledAt: true,
  quotePaise: true,
  createdAt: true,
  project: { select: { id: true, name: true } },
} as const satisfies Prisma.ServiceBookingSelect;

type ListRow = Prisma.ServiceBookingGetPayload<{ select: typeof LIST_SELECT }>;

function listRowToView(row: ListRow): ServiceBookingListItem {
  return {
    reference: row.reference,
    serviceSlug: row.serviceSlug,
    serviceName: row.serviceName,
    kind: row.kind,
    status: row.status,
    preferredDate: row.preferredDate ? fromCalendarDate(row.preferredDate) : null,
    preferredSlot: row.preferredSlot ? FROM_DB_SLOT[row.preferredSlot] : null,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    quotePaise: row.quotePaise,
    projectId: row.project?.id ?? null,
    projectName: row.project?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The caller's own bookings, newest first — optionally narrowed to one
    project, for the project detail page's own services list. */
export async function listBookingsForUser(
  userId: string,
  opts: { projectId?: string } = {},
): Promise<ServiceBookingListItem[]> {
  const rows = await db.serviceBooking.findMany({
    where: { userId, ...(opts.projectId ? { projectId: opts.projectId } : {}) },
    orderBy: { createdAt: "desc" },
    select: LIST_SELECT,
  });
  return rows.map(listRowToView);
}

export interface ServiceBookingFileView {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ServiceBookingHistoryItem {
  toStatus: ServiceBookingStatus;
  at: string;
}

export interface ServiceBookingDetail extends ServiceBookingListItem {
  siteLine: string;
  siteCity: string;
  sitePincode: string;
  projectKind: ProjectKind | null;
  areaSqft: number | null;
  requirements: string;
  notes: string;
  quoteNote: string | null;
  quotedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  files: ServiceBookingFileView[];
  statusHistory: ServiceBookingHistoryItem[];
}

const DETAIL_SELECT = {
  ...LIST_SELECT,
  siteLine: true,
  siteCity: true,
  sitePincode: true,
  projectKind: true,
  areaSqft: true,
  requirements: true,
  notes: true,
  quoteNote: true,
  quotedAt: true,
  acceptedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancelReason: true,
  files: {
    select: {
      file: { select: { id: true, originalName: true, contentType: true, sizeBytes: true } },
    },
  },
  /* No actor, no note — a customer sees what happened to their own
     booking, not who at Quoin did it or the internal note they left. */
  statusChanges: {
    orderBy: { createdAt: "asc" },
    select: { toStatus: true, createdAt: true },
  },
} as const satisfies Prisma.ServiceBookingSelect;

type DetailRow = Prisma.ServiceBookingGetPayload<{ select: typeof DETAIL_SELECT }>;

function detailRowToView(row: DetailRow): ServiceBookingDetail {
  return {
    ...listRowToView(row),
    siteLine: row.siteLine,
    siteCity: row.siteCity,
    sitePincode: row.sitePincode,
    projectKind: row.projectKind ? PROJECT_KIND_FROM_DB[row.projectKind] : null,
    areaSqft: row.areaSqft,
    requirements: row.requirements,
    notes: row.notes,
    quoteNote: row.quoteNote,
    quotedAt: row.quotedAt ? row.quotedAt.toISOString() : null,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancelReason: row.cancelReason,
    files: row.files.map((f) => ({
      id: f.file.id,
      originalName: f.file.originalName,
      contentType: f.file.contentType,
      sizeBytes: f.file.sizeBytes,
    })),
    statusHistory: row.statusChanges.map((c) => ({
      toStatus: c.toStatus,
      at: c.createdAt.toISOString(),
    })),
  };
}

/** One booking, but only when it belongs to `userId` — a booking that
    exists but belongs to someone else and one that does not exist at all
    both resolve to `null`, exactly as `getProjectForUser` treats either. */
export async function getBookingForUser(
  userId: string,
  reference: string,
): Promise<ServiceBookingDetail | null> {
  const row = await db.serviceBooking.findFirst({
    where: { reference, userId },
    select: DETAIL_SELECT,
  });
  return row ? detailRowToView(row) : null;
}

/** ---- Writes: customer actions ------------------------------------------------ */

export type CustomerBookingAction = "accept_quote" | "cancel";

/**
 * Accepts a quote, or cancels — the only two moves a customer may make
 * themselves; everything else (a confirmed day, a quote, work begun) is
 * staff asserting a fact about Quoin's own side, via `staffUpdate`.
 *
 * `bookingTransitionProblem` is checked too, not just `canTransitionBooking`
 * — cheap here since it only ever fires for `QUOTE_RECEIVED`/`SCHEDULED`,
 * neither of which a customer can reach, but calling it is what keeps this
 * function honest if that table ever grows a customer-reachable edge with
 * a precondition.
 */
export async function customerAction(
  userId: string,
  reference: string,
  action: CustomerBookingAction,
  reason?: string,
): Promise<ServiceBookingResult> {
  const booking = await db.serviceBooking.findFirst({
    where: { reference, userId },
    select: { id: true, status: true, quotePaise: true, scheduledAt: true },
  });
  if (!booking) throw new ServiceBookingNotFoundError();

  const to: ServiceBookingStatus = action === "accept_quote" ? "CONFIRMED" : "CANCELLED";

  if (!canTransitionBooking(booking.status, to, "customer")) {
    throw new ServiceBookingTransitionNotAllowedError(
      action === "accept_quote"
        ? "This quote can no longer be accepted."
        : "This booking can no longer be cancelled.",
    );
  }

  const problem = bookingTransitionProblem(to, booking);
  if (problem) throw new ServiceBookingFieldRequiredError(problem);

  const trimmedReason = reason?.trim() || null;
  /* A decline is a cancellation from QUOTE_RECEIVED specifically — see the
     module comment on `customerAction` in AGENTS.md for this slice. Falls
     back to a plain, honest reason when the customer left the box empty
     rather than leaving `cancelReason` blank on what was, from Quoin's
     side, a "no" to a real quote. */
  const cancelReason =
    to === "CANCELLED"
      ? trimmedReason ?? (booking.status === "QUOTE_RECEIVED" ? "Quote declined" : null)
      : null;

  await db.$transaction(async (tx) => {
    const claimed = await tx.serviceBooking.updateMany({
      where: { id: booking.id, status: booking.status },
      data:
        to === "CONFIRMED"
          ? { status: "CONFIRMED", acceptedAt: new Date() }
          : { status: "CANCELLED", cancelledAt: new Date(), cancelReason },
    });
    if (claimed.count === 0) throw new ServiceBookingRaceError();

    await tx.serviceBookingStatusChange.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: to,
        actorUserId: userId,
        note: to === "CANCELLED" ? cancelReason : null,
      },
    });
  });

  return { reference, status: to };
}

/** ---- Reads + writes: staff ---------------------------------------------------- */

export interface StaffBookingRow {
  reference: string;
  serviceSlug: string;
  serviceName: string;
  kind: ServiceBookingKind;
  status: ServiceBookingStatus;
  customerName: string | null;
  customerPhone: string | null;
  projectName: string | null;
  preferredDate: string | null;
  preferredSlot: ConsultSlot | null;
  scheduledAt: string | null;
  createdAt: string;
}

export interface StaffBookingListPage {
  items: StaffBookingRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The service queue, newest first — optionally narrowed to one status,
    matching the shape `listAdminOrders` already gives the order queue. */
export async function listBookingsForStaff(params: {
  status?: ServiceBookingStatus;
  page?: number;
}): Promise<StaffBookingListPage> {
  const { page, pageSize, skip } = resolveAdminPage(params.page);
  const where: Prisma.ServiceBookingWhereInput = params.status
    ? { status: params.status }
    : {};

  const [total, rows] = await Promise.all([
    db.serviceBooking.count({ where }),
    db.serviceBooking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        reference: true,
        serviceSlug: true,
        serviceName: true,
        kind: true,
        status: true,
        preferredDate: true,
        preferredSlot: true,
        scheduledAt: true,
        createdAt: true,
        user: { select: { name: true, phone: true } },
        project: { select: { name: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      reference: row.reference,
      serviceSlug: row.serviceSlug,
      serviceName: row.serviceName,
      kind: row.kind,
      status: row.status,
      customerName: row.user.name,
      customerPhone: row.user.phone,
      projectName: row.project?.name ?? null,
      preferredDate: row.preferredDate ? fromCalendarDate(row.preferredDate) : null,
      preferredSlot: row.preferredSlot ? FROM_DB_SLOT[row.preferredSlot] : null,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface StaffBookingHistoryItem {
  fromStatus: ServiceBookingStatus | null;
  toStatus: ServiceBookingStatus;
  actorName: string | null;
  actorPhone: string | null;
  note: string | null;
  at: string;
}

export interface StaffBookingDetail
  extends Omit<ServiceBookingDetail, "statusHistory"> {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  statusHistory: StaffBookingHistoryItem[];
}

const STAFF_DETAIL_SELECT = {
  ...DETAIL_SELECT,
  user: { select: { name: true, phone: true, email: true } },
  statusChanges: {
    orderBy: { createdAt: "asc" },
    select: {
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
      actor: { select: { name: true, phone: true } },
    },
  },
} as const satisfies Prisma.ServiceBookingSelect;

type StaffDetailRow = Prisma.ServiceBookingGetPayload<{ select: typeof STAFF_DETAIL_SELECT }>;

/** Everything a person on the phone with this customer needs — the same
    ambition `getAdminOrder` states for orders. */
export async function getBookingForStaff(reference: string): Promise<StaffBookingDetail | null> {
  const row = (await db.serviceBooking.findUnique({
    where: { reference },
    select: STAFF_DETAIL_SELECT,
  })) as StaffDetailRow | null;
  if (!row) return null;

  const { statusHistory: _omit, ...detail } = detailRowToView(row);

  return {
    ...detail,
    customerName: row.user.name,
    customerPhone: row.user.phone,
    customerEmail: row.user.email,
    statusHistory: row.statusChanges.map((c) => ({
      fromStatus: c.fromStatus,
      toStatus: c.toStatus,
      actorName: c.actor?.name ?? null,
      actorPhone: c.actor?.phone ?? null,
      note: c.note,
      at: c.createdAt.toISOString(),
    })),
  };
}

export interface StaffBookingUpdateInput {
  toStatus?: ServiceBookingStatus;
  quotePaise?: number;
  quoteNote?: string;
  scheduledAt?: Date;
  note?: string;
}

/**
 * Staff moving a booking, setting a quote, or agreeing an exact time — the
 * one function that may write any of `quotePaise`, `scheduledAt` or a
 * status other than the customer-reachable two.
 *
 * `toStatus` is optional: a field-only edit (typing a quote note before
 * sending the quote, say) writes no audit row, because nothing about the
 * booking's *state* changed — only a status move is a fact worth a line
 * in the history a customer reads back.
 *
 * The resulting row (current fields merged with whatever this call is
 * changing) is what `bookingTransitionProblem` is asked about, not the row
 * as it stood before the call — so a request that sets `quotePaise` *and*
 * `toStatus: "QUOTE_RECEIVED"` in the same call is legal, and one that
 * asks for `QUOTE_RECEIVED` with no amount, ever, is not.
 */
export async function staffUpdate(
  staffUserId: string,
  reference: string,
  input: StaffBookingUpdateInput,
): Promise<ServiceBookingResult> {
  const booking = await db.serviceBooking.findUnique({
    where: { reference },
    select: {
      id: true,
      userId: true,
      status: true,
      serviceName: true,
      quotePaise: true,
      scheduledAt: true,
      preferredDate: true,
      preferredSlot: true,
    },
  });
  if (!booking) throw new ServiceBookingNotFoundError();

  const nextQuotePaise = input.quotePaise ?? booking.quotePaise;
  const nextScheduledAt = input.scheduledAt ?? booking.scheduledAt;

  if (input.toStatus) {
    if (!canTransitionBooking(booking.status, input.toStatus, "staff")) {
      throw new ServiceBookingTransitionNotAllowedError(
        `Cannot move this booking from its current status to that one.`,
      );
    }
    const problem = bookingTransitionProblem(input.toStatus, {
      quotePaise: nextQuotePaise,
      scheduledAt: nextScheduledAt,
    });
    if (problem) throw new ServiceBookingFieldRequiredError(problem);
  }

  const now = new Date();
  const data: Prisma.ServiceBookingUpdateManyMutationInput = {};

  if (input.quotePaise !== undefined) data.quotePaise = input.quotePaise;
  if (input.quoteNote !== undefined) data.quoteNote = input.quoteNote;
  if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt;

  if (input.toStatus) {
    data.status = input.toStatus;
    if (input.toStatus === "QUOTE_RECEIVED") data.quotedAt = now;
    if (input.toStatus === "COMPLETED") data.completedAt = now;
    if (input.toStatus === "CANCELLED") {
      data.cancelledAt = now;
      data.cancelReason = input.note?.trim() || null;
    }
    /* The customer's own accept takes the same edge through
       `customerAction` — this is staff taking it *for* them, which is
       just as much an acceptance and gets the same timestamp. */
    if (input.toStatus === "CONFIRMED" && booking.status === "QUOTE_RECEIVED") {
      data.acceptedAt = now;
    }
  }

  await db.$transaction(async (tx) => {
    const claimed = await tx.serviceBooking.updateMany({
      where: { id: booking.id, status: booking.status },
      data,
    });
    if (claimed.count === 0) throw new ServiceBookingRaceError();

    if (input.toStatus) {
      await tx.serviceBookingStatusChange.create({
        data: {
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: input.toStatus,
          actorUserId: staffUserId,
          note: input.note?.trim() || null,
        },
      });
    }
  });

  if (input.toStatus === "QUOTE_RECEIVED") {
    await notify({
      userId: booking.userId,
      kind: "QUOTE_RECEIVED",
      title: `Quote received: ${booking.serviceName}`,
      body: `${formatPrice(nextQuotePaise as Paise)} — review and accept it in your account.`,
      href: `/account/services/${reference}`,
      dedupeKey: `booking:${reference}:quote:${now.getTime()}`,
    });
  } else if (input.toStatus === "SCHEDULED") {
    const when = formatBookingWhen({
      scheduledAt: nextScheduledAt,
      preferredDate: booking.preferredDate,
      preferredSlot: booking.preferredSlot ? FROM_DB_SLOT[booking.preferredSlot] : null,
    });
    await notify({
      userId: booking.userId,
      kind: "SERVICE_BOOKED",
      title: `Visit scheduled: ${booking.serviceName}`,
      body: when ?? "",
      href: `/account/services/${reference}`,
      dedupeKey: `booking:${reference}:scheduled:${(nextScheduledAt as Date).getTime()}`,
    });
  } else if (input.toStatus === "CONFIRMED") {
    await notify({
      userId: booking.userId,
      kind: "SERVICE_BOOKED",
      title: `Booking confirmed: ${booking.serviceName}`,
      body: "",
      href: `/account/services/${reference}`,
      dedupeKey: `booking:${reference}:CONFIRMED`,
    });
  }

  return { reference, status: input.toStatus ?? booking.status };
}
