import { addDays, istDay, type ConsultSlot } from "@/lib/types/consult";

/**
 * Pure helpers for service bookings.
 *
 * Nothing here touches Prisma, `env` or the clock except by parameter, so
 * every rule a booking has to satisfy — which day is choosable, what a
 * staff member typed as a quote, what an .ics attachment says — is
 * testable without a database and safe to share with a client component
 * that only needs to *render* the same fact the server already decided.
 */

/** ---- Preferred day ------------------------------------------------------
 * The customer picks a calendar day and a half-day window, never a time —
 * see the model comment on `ServiceBooking.preferredDate`. This is the one
 * check that decides whether a day is even choosable.
 */

/** Bookable from tomorrow. Same day is not offered — nobody at Quoin has
    confirmed anything yet, and "today" invites a customer to expect a
    visit within hours of submitting a form nobody has looked at. */
const MIN_LEAD_DAYS = 1;

/**
 * How far ahead a customer may ask for.
 *
 * Three months. Long enough to cover a renovation booked well in advance,
 * short enough that a date picker is not open to next year for a business
 * with no roster to check it against — the same reasoning as
 * `CONSULT_HORIZON_DAYS`, widened because a service booking is a real
 * commitment of a trade's time, not a 20-minute call.
 */
export const BOOKING_HORIZON_DAYS = 90;

const CALENDAR_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Same re-serialise-and-compare trick as `isCalendarDay`
    (`src/lib/data/projects.ts`), copied rather than imported: that module
    is a Prisma data layer, and this one has to stay importable from a
    client component with no server dependency at all. */
function isRealCalendarDay(value: string): boolean {
  if (!CALENDAR_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

/**
 * Whether `day` (`YYYY-MM-DD`) is choosable as a preferred visit day, as of
 * `now` — tomorrow through `BOOKING_HORIZON_DAYS` days out, in IST.
 */
export function validatePreferredDay(day: string, now: Date = new Date()): boolean {
  if (!isRealCalendarDay(day)) return false;
  const today = istDay(now);
  const earliest = addDays(today, MIN_LEAD_DAYS);
  const latest = addDays(today, BOOKING_HORIZON_DAYS);
  return day >= earliest && day <= latest;
}

/** ---- Rupees to paise -----------------------------------------------------
 * The only place a staff member types a rupee figure into this slice — the
 * quote amount form. Everywhere else in the app a price is computed, never
 * typed, and this function's whole job is to make sure what was typed
 * survives the trip to an integer without ever becoming a float.
 */

export class InvalidRupeeAmountError extends Error {
  constructor(message = "Enter an amount in rupees, like 12500 or 12,500.50") {
    super(message);
    this.name = "InvalidRupeeAmountError";
  }
}

/** Digits, optional thousands commas (stripped, not validated for correct
    grouping — "1,2,500" is odd but unambiguous), optional paise to two
    decimal places. No sign: a quote is never negative. */
const RUPEE_AMOUNT_RE = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a rupee string into integer paise — string concatenation and
 * `Number()` on the *result*, never `parseFloat(rupees) * 100`. Floating
 * point cannot represent most rupee-and-paise values exactly (₹12,500.10 ×
 * 100 is 1250009.999999998 in IEEE 754), so multiplying is the bug and
 * padding the decimal part to two digits before converting is the fix.
 */
export function rupeesToPaise(input: string): number {
  const cleaned = input.trim().replace(/,/g, "");
  const match = RUPEE_AMOUNT_RE.exec(cleaned);
  if (!match) throw new InvalidRupeeAmountError();

  const [, whole, fraction = ""] = match;
  const paiseDigits = whole + fraction.padEnd(2, "0");
  const value = Number(paiseDigits);

  /* Guards a string of digits long enough to overflow a safe integer —
     not reachable through the admin form's own input cap, but this
     function is the actual authority and must not silently wrap. */
  if (!Number.isSafeInteger(value)) throw new InvalidRupeeAmountError();

  return value;
}

/** ---- Calendar attachments ------------------------------------------------
 * One `.ics` builder for both shapes a booking can be in: an all-day event
 * while only a preferred day is known, and a timed one once staff have set
 * `scheduledAt`. Hand-built rather than a dependency — see the module
 * comment on why this app carries four runtime dependencies and not five.
 */

export interface IcsInput {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** `YYYY-MM-DD`. Renders as an all-day `VALUE=DATE` event. Mutually
      exclusive with `start` — a caller with both wants the exact time,
      which `start` alone already says. */
  day?: string;
  /** An exact instant. Renders `DTSTART`/`DTEND` in UTC, which every
      calendar client converts to the viewer's own timezone — the correct
      behaviour once a person, not a preference, has fixed the time. */
  start?: Date;
  /** Only meaningful with `start`. Defaults to an hour — long enough for
      a real site visit, and this app has no per-service duration to be
      more precise than that. */
  durationMinutes?: number;
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are the four
    characters `TEXT` values must escape. */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsInstant(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsDay(day: string): string {
  return day.replace(/-/g, "");
}

export function buildIcs(input: IcsInput): string {
  if (!input.start && !input.day) {
    throw new Error("buildIcs needs a scheduled instant or a preferred day");
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Quoin//Service Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${icsInstant(new Date())}`,
  ];

  if (input.start) {
    const durationMs = (input.durationMinutes ?? 60) * 60 * 1000;
    lines.push(`DTSTART:${icsInstant(input.start)}`);
    lines.push(`DTEND:${icsInstant(new Date(input.start.getTime() + durationMs))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsDay(input.day!)}`);
  }

  lines.push(`SUMMARY:${icsEscape(input.title)}`);
  if (input.description) lines.push(`DESCRIPTION:${icsEscape(input.description)}`);
  if (input.location) lines.push(`LOCATION:${icsEscape(input.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  /* CRLF, per RFC 5545 §3.1 — a client that only tolerates bare `\n` is
     tolerant of this too, but several do not accept the reverse. */
  return lines.join("\r\n") + "\r\n";
}

/** ---- Display -------------------------------------------------------------
 * One place that turns "what does this booking say about when it
 * happens" into the sentence a customer or a staff member reads — so the
 * account page, the confirmation hero and any future notification agree.
 */

export interface BookingWhenInput {
  scheduledAt: Date | null;
  preferredDate: Date | null;
  preferredSlot: ConsultSlot | null;
}

const DAY_MONTH_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const SLOT_LABEL: Record<ConsultSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/**
 * "18 Sep · 11:00 AM" once a person has agreed an exact time, else
 * "18 Sep · Morning (preferred)" for what the customer asked for, else
 * `null` when nothing has been said at all — a quote request with no
 * preferred day is a valid, ordinary case, not a fact to invent.
 */
export function formatBookingWhen(input: BookingWhenInput): string | null {
  if (input.scheduledAt) {
    return `${DAY_MONTH_FORMAT.format(input.scheduledAt)} · ${TIME_FORMAT.format(input.scheduledAt)}`;
  }
  if (input.preferredDate) {
    const day = DAY_MONTH_FORMAT.format(input.preferredDate);
    const slot = input.preferredSlot ? ` · ${SLOT_LABEL[input.preferredSlot]}` : "";
    return `${day}${slot} (preferred)`;
  }
  return null;
}

/**
 * The same rule, for the wire shape a read actually comes back as — an
 * ISO instant, an ISO calendar day, or `null`. `ServiceBookingListItem`
 * and `ServiceBookingDetail` (`src/lib/data/service-bookings.ts`) carry
 * strings rather than `Date`s so they stay JSON-serialisable across the
 * server/client component boundary; this is the one place that string
 * shape is turned back into the instants `formatBookingWhen` needs, so a
 * list card and a detail page never each grow their own copy of the
 * `T00:00:00Z` convention `toCalendarDate` already uses for every other
 * `@db.Date` column in this app.
 */
export function formatBookingWhenFromView(input: {
  scheduledAt: string | null;
  preferredDate: string | null;
  preferredSlot: ConsultSlot | null;
}): string | null {
  return formatBookingWhen({
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    preferredDate: input.preferredDate ? new Date(`${input.preferredDate}T00:00:00Z`) : null,
    preferredSlot: input.preferredSlot,
  });
}
