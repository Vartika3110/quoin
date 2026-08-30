/**
 * The consultation domain, as the storefront and the API speak it.
 *
 * Prisma spells enums in SCREAMING_SNAKE; the wire contract and the UI use
 * lower snake, exactly as the catalogue does. The mapping lives in
 * `src/lib/data/consultations.ts` so a rename in the schema surfaces there
 * as a type error rather than as a silently mis-rendered chip.
 *
 * Nothing in this file imports Prisma or `env`, so the client bundle can
 * take the labels and the slot windows without dragging the server in.
 */

/** How the expert meets the customer. */
export type ConsultMode = "video" | "site_visit";

/** The half-day window a customer asks for — never an exact time. */
export type ConsultSlot = "morning" | "afternoon" | "evening";

export type ConsultStatus = "requested" | "scheduled" | "completed" | "cancelled";

export const CONSULT_MODES: ConsultMode[] = ["video", "site_visit"];
export const CONSULT_SLOTS: ConsultSlot[] = ["morning", "afternoon", "evening"];

/**
 * What each mode actually is, in one place.
 *
 * `price` is a string rather than paise on purpose: the site visit fee is
 * quoted after the expert sees the scope, and there is no priced service
 * row behind it to resolve. A hard-coded `₹499` here would be a number
 * nobody in the business has agreed to.
 */
export interface ConsultModeInfo {
  id: ConsultMode;
  title: string;
  /** One line, shown under the title on the chooser. */
  summary: string;
  /** How long the expert is with the customer. */
  duration: string;
  price: string;
  /** What the customer gets. Three at most — this is a chooser, not a page. */
  gets: string[];
  /** Stated plainly so nobody picks the wrong mode and is disappointed. */
  limit: string;
}

export const CONSULT_MODE_INFO: Record<ConsultMode, ConsultModeInfo> = {
  video: {
    id: "video",
    title: "Video consultation",
    summary: "Walk an expert through the space on a call.",
    duration: "20 minutes",
    price: "Free",
    gets: [
      "Material and finish options for what you are building",
      "A budget range before you commit to anything",
      "A written summary on WhatsApp afterwards",
    ],
    limit: "Nothing is measured on a call — a quote needs a site visit.",
  },
  site_visit: {
    id: "site_visit",
    title: "Site visit",
    summary: "An expert comes to the site and measures it.",
    duration: "About an hour",
    price: "Quoted before the visit",
    gets: [
      "Measurements taken on site, not estimated",
      "An itemised quantity list you can order against",
      "Condition notes — levels, damp, existing services",
    ],
    limit: "Available in the areas Quoin operates in. The fee is confirmed on the call back.",
  },
};

/** The windows, and what they mean in hours. Labels are shown; times are the contract. */
export const CONSULT_SLOT_LABEL: Record<ConsultSlot, string> = {
  morning: "9 am – 12 pm",
  afternoon: "12 – 4 pm",
  evening: "4 – 8 pm",
};

export const CONSULT_STATUS_LABEL: Record<ConsultStatus, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * How far ahead a customer may ask for.
 *
 * Two weeks. Further out is not a booking anyone can honour — the roster
 * it would have to be checked against does not exist — and a date picker
 * open to next year invites requests that can only be declined.
 */
export const CONSULT_HORIZON_DAYS = 14;

/** What the storefront renders after a request is accepted. */
export interface ConsultRequestView {
  reference: string;
  mode: ConsultMode;
  status: ConsultStatus;
  /** Masked, even back to the person who typed it — see `maskPhone`. */
  phone: string;
  /** ISO calendar day (YYYY-MM-DD), or null when the customer had no preference. */
  preferredDate: string | null;
  preferredSlot: ConsultSlot | null;
  areaName: string | null;
  createdAt: string;
}

/**
 * A calendar day as `YYYY-MM-DD` in India, which is the only timezone the
 * business operates in.
 *
 * `toISOString().slice(0, 10)` is the obvious version and is wrong for
 * half of every Indian day: 30 August 00:30 IST is 29 August in UTC, so a
 * customer asking for "today" would be booked for yesterday. `en-CA`
 * formats as YYYY-MM-DD, which is why it is used rather than parsed.
 */
export function istDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** `YYYY-MM-DD` shifted by whole days, without leaving the string domain. */
export function addDays(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** "Mon 1 Sep" — short enough for a chip, unambiguous about the weekday. */
export function formatConsultDay(day: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T00:00:00Z`));
}
