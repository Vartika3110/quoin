import type { ServiceBookingKind, ServiceBookingStatus } from "@prisma/client";

/**
 * The service-booking state machine — the one place a transition is decided.
 *
 * Pure and client-safe (type-only Prisma import), so the booking data layer,
 * the admin form and the customer's own buttons all ask the same table
 * rather than each keeping a private idea of what may follow what.
 *
 * Every edge names who may take it. A customer can accept a quote and can
 * walk away before work starts; everything that asserts something about
 * Quoin's side — a price, a confirmed day, work begun — is staff's alone.
 */

export type BookingActor = "customer" | "staff";

const CUSTOMER_OR_STAFF = ["customer", "staff"] as const;
const STAFF = ["staff"] as const;

const TRANSITIONS: Record<
  ServiceBookingStatus,
  Partial<Record<ServiceBookingStatus, readonly BookingActor[]>>
> = {
  REQUESTED: { CONFIRMED: STAFF, SCHEDULED: STAFF, CANCELLED: CUSTOMER_OR_STAFF },
  QUOTE_PENDING: { QUOTE_RECEIVED: STAFF, CANCELLED: CUSTOMER_OR_STAFF },
  /* Staff may accept on the customer's behalf — agreement often happens on
     the phone — and the audit row records which of the two it was. Back to
     QUOTE_PENDING is a withdrawn quote being revised, not a customer's
     "no": declining is CANCELLED, with a reason. */
  QUOTE_RECEIVED: {
    CONFIRMED: CUSTOMER_OR_STAFF,
    QUOTE_PENDING: STAFF,
    CANCELLED: CUSTOMER_OR_STAFF,
  },
  CONFIRMED: { SCHEDULED: STAFF, CANCELLED: CUSTOMER_OR_STAFF },
  SCHEDULED: { IN_PROGRESS: STAFF, CANCELLED: CUSTOMER_OR_STAFF },
  /* Work has started, so a customer cancelling is a conversation about
     money already spent on site, not a button. */
  IN_PROGRESS: { COMPLETED: STAFF, CANCELLED: STAFF },
  COMPLETED: {},
  CANCELLED: {},
};

export function canTransitionBooking(
  from: ServiceBookingStatus,
  to: ServiceBookingStatus,
  actor: BookingActor,
): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function nextBookingStatuses(
  from: ServiceBookingStatus,
  actor: BookingActor,
): ServiceBookingStatus[] {
  return (Object.keys(TRANSITIONS[from]) as ServiceBookingStatus[]).filter((to) =>
    canTransitionBooking(from, to, actor),
  );
}

export function initialBookingStatus(kind: ServiceBookingKind): ServiceBookingStatus {
  return kind === "QUOTE" ? "QUOTE_PENDING" : "REQUESTED";
}

/**
 * What a transition needs on the row before it may happen. Checked by the
 * data layer against the values the write would leave behind, so a quote
 * cannot be "received" without an amount, nor a visit "scheduled" without
 * a time.
 */
export function bookingTransitionProblem(
  to: ServiceBookingStatus,
  row: { quotePaise: number | null; scheduledAt: Date | null },
): string | null {
  if (to === "QUOTE_RECEIVED" && !(row.quotePaise != null && row.quotePaise > 0)) {
    return "Enter the quoted amount before sending the quote.";
  }
  if (to === "SCHEDULED" && !row.scheduledAt) {
    return "Set the agreed date and time before scheduling.";
  }
  return null;
}

export const BOOKING_STATUS_LABEL: Record<ServiceBookingStatus, string> = {
  REQUESTED: "Requested",
  QUOTE_PENDING: "Quote pending",
  QUOTE_RECEIVED: "Quote received",
  CONFIRMED: "Confirmed",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Same tone rule as `ORDER_STATUS_TONE`: `warning` where the customer has
    to act, `info` while Quoin is working on it, `success` once done. */
export const BOOKING_STATUS_TONE: Record<
  ServiceBookingStatus,
  "neutral" | "accent" | "success" | "warning" | "info"
> = {
  REQUESTED: "accent",
  QUOTE_PENDING: "accent",
  QUOTE_RECEIVED: "warning",
  CONFIRMED: "info",
  SCHEDULED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export type BookingGroup = "upcoming" | "in_progress" | "completed" | "cancelled";

export function bookingGroup(status: ServiceBookingStatus): BookingGroup {
  switch (status) {
    case "IN_PROGRESS":
      return "in_progress";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "upcoming";
  }
}

/**
 * Whether an agreed quote counts against a project's budget as committed.
 * Only once the customer (or staff for them) has accepted it, and until it
 * is cancelled — a quote merely received is an offer, not spend.
 */
export function bookingCommitsMoney(status: ServiceBookingStatus): boolean {
  return (
    status === "CONFIRMED" ||
    status === "SCHEDULED" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED"
  );
}
