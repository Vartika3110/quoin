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

export type ConsultStatus =
  /** A paid call whose fee has not been captured. See `CONSULT_HOLD_MINUTES`. */
  | "pending_payment"
  | "requested"
  | "scheduled"
  | "completed"
  | "cancelled";

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
  /* "Awaiting payment", not "Pending" — the customer needs to know the
     ball is in their court, and operations needs to know this one is not
     in the queue yet. */
  pending_payment: "Awaiting payment",
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

  /* ---- Paid video consultations ---------------------------------------
   *
   * Null on a free call-back request and on every row written before
   * consultations were chargeable, which is most of them. The account
   * screen renders the paid detail only when `startsAt` is set, so an
   * old row is unaffected rather than showing a row of blanks. */

  /** Which price band, or null for a free request or a site visit. */
  topic: ConsultTopic | null;
  /** Paise, frozen at booking. Zero when nothing was charged. */
  feePaise: number;
  /** ISO instant — the exact time agreed, for a paid call only. */
  startsAt: string | null;
  durationMinutes: number | null;
  /** Where the fee got to. `not_required` for a free request. */
  paymentStatus: ConsultPaymentStatus;
}

/* `ConsultTopic` and `ConsultPaymentStatus` are declared below rather
   than above this interface. TypeScript hoists type declarations within a
   module, so the order here is the order the file reads best in — the
   free-consultation domain first, the chargeable one after it — and not a
   dependency order. */

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

/** ---- Paid video consultations ------------------------------------------
 *
 * Everything below this line is the chargeable 15–20 minute video call.
 * The free call-back request and the site visit above are unchanged and
 * still the right thing for somebody who does not want to pay to ask a
 * question.
 *
 * Nothing here imports Prisma or `env`, so the booking form can take the
 * fees, the topics and the slot grid without dragging the server into the
 * client bundle. The mapping onto the schema's SCREAMING_SNAKE lives in
 * `src/lib/data/consultations.ts`, as it does for every other enum.
 */

/** Which price band a consultation falls in. */
export type ConsultTopic = "repair" | "products" | "interior";

export const CONSULT_TOPICS: ConsultTopic[] = ["repair", "products", "interior"];

export interface ConsultTopicInfo {
  id: ConsultTopic;
  title: string;
  /**
   * One line describing the band.
   *
   * Not rendered on the chooser any more — see the note in
   * `ExpertSession`. Kept because it is the plainest description of each
   * band this codebase has, and the page metadata and any future
   * confirmation message want it rather than a second copy.
   */
  summary: string;
  /**
   * The fee, in paise, integer — the rule this schema follows everywhere.
   *
   * **Inclusive of GST**, like every other price on this site: the fee a
   * customer sees is the fee they are charged, and the tax is extracted
   * from it rather than added on top.
   *
   * These three numbers are the owner's, not a guess: ₹99 for repair
   * guidance, ₹149 for product selection, ₹200 for interiors.
   */
  feePaise: number;
  /** What this band actually covers. Concrete, so nobody books the wrong
      one — three or four examples, in the customer's own words. */
  covers: string[];
}

export const CONSULT_TOPIC_INFO: Record<ConsultTopic, ConsultTopicInfo> = {
  repair: {
    id: "repair",
    title: "Repairs & service advice",
    summary: "Something is broken, leaking or not working and you want to know what it needs.",
    feePaise: 99_00,
    covers: [
      "What is actually wrong, and which trade fixes it",
      "Whether it is a repair or a replacement",
      "What the job should cost, and what to watch for",
      "Which service to book here, if you want us to do it",
    ],
  },
  products: {
    id: "products",
    title: "Product & material selection",
    summary: "You know what you are building and want help choosing what to buy for it.",
    feePaise: 149_00,
    covers: [
      "Which product, brand and grade suits the job",
      "Quantities, sizes and what to order spare",
      "Where it is worth spending and where it is not",
      "A shortlist you can order from here afterwards",
    ],
  },
  interior: {
    id: "interior",
    title: "Interiors & renovation",
    summary: "A room, a floor or a whole home — layout, finishes and how to sequence the work.",
    feePaise: 200_00,
    covers: [
      "Layout, finishes and a palette that works together",
      "How to phase the work, and in what order",
      "A realistic budget range for what you want",
      "What to settle before any trade starts",
    ],
  },
};

/**
 * How long a consultation runs.
 *
 * Booked as 20 minutes and described to the customer as "15–20 minutes",
 * which is the honest pair: the slot held is twenty, and a question
 * answered in fifteen does not need the other five padded out.
 */
export const CONSULT_DURATION_MINUTES = 20;

/**
 * How long an unpaid booking holds its slot.
 *
 * Long enough to finish a UPI payment on a slow connection, short enough
 * that an abandoned payment sheet does not take a 6pm slot off the board
 * for the rest of the evening. Nothing sweeps these rows — `slotIsFree`
 * simply stops counting a `PENDING` booking once it is this old, so there
 * is no cron to forget to run. A row that was never paid for stays as the
 * honest record that somebody started and did not finish.
 */
export const CONSULT_HOLD_MINUTES = 15;

/**
 * The start times on offer, in IST, as minutes past midnight.
 *
 * A fixed grid rather than a free time picker, and half-hourly rather
 * than continuous, because the thing being sold is a named twenty
 * minutes of somebody's day. The grid runs 10am–1pm and 3pm–7:30pm: no
 * 9am start (nobody is at a desk for a 9am video call that was booked at
 * 8:55), a real break over lunch, and a last start at 7:30pm, which is
 * when a customer who works is actually free.
 *
 * Exported so the booking form and the availability query read the same
 * list — two copies would offer a slot the server then refuses.
 */
export const CONSULT_START_MINUTES: number[] = [
  10 * 60,
  10 * 60 + 30,
  11 * 60,
  11 * 60 + 30,
  12 * 60,
  12 * 60 + 30,
  15 * 60,
  15 * 60 + 30,
  16 * 60,
  16 * 60 + 30,
  17 * 60,
  17 * 60 + 30,
  18 * 60,
  18 * 60 + 30,
  19 * 60,
  19 * 60 + 30,
];

/**
 * How many consultations may start at the same instant.
 *
 * Two, because Quoin has more than one expert and fewer than many. This
 * is the one number in this file that is a capacity claim, so it is
 * deliberately conservative: a slot oversold is a customer who paid and
 * was stood up, which costs far more than a slot left empty.
 *
 * It belongs in a roster table the day there is one. Until then it is a
 * constant, in the open, rather than an unstated assumption.
 */
export const CONSULT_CONCURRENT_EXPERTS = 2;

/** "10:30 am" — how a start time is written on a chip and in a receipt. */
export function formatConsultTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`} ${suffix}`;
}

/**
 * An IST calendar day plus minutes-past-midnight, as a UTC instant.
 *
 * India is UTC+5:30 and has no daylight saving, so the offset is a
 * constant and this is exact arithmetic rather than a timezone library.
 * Written as one function because getting it wrong by 5½ hours puts a
 * morning appointment in the previous evening, and `istDay` above exists
 * because the same mistake was made in the other direction.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

export function istInstant(day: string, minutes: number): Date {
  const midnightUtc = new Date(`${day}T00:00:00Z`).getTime();
  return new Date(midnightUtc + (minutes - IST_OFFSET_MINUTES) * 60_000);
}

/** The inverse: which IST day and start-minute an instant falls on. */
export function istMinutes(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/**
 * Whether a start time is still bookable.
 *
 * Two independent reasons it might not be: it is in the past (or too
 * close to now to be worth offering), and it is full. Both are checked
 * server-side at booking time as well as here, because this function also
 * runs in the browser, where the clock is the customer's.
 */
export const CONSULT_MIN_NOTICE_MINUTES = 45;

export function startIsBookable(input: {
  startsAt: Date;
  now: Date;
  /** Paid or held bookings already at this instant. */
  taken: number;
}): boolean {
  if (input.taken >= CONSULT_CONCURRENT_EXPERTS) return false;
  const noticeMs = CONSULT_MIN_NOTICE_MINUTES * 60_000;
  return input.startsAt.getTime() - input.now.getTime() >= noticeMs;
}

export const CONSULT_PAYMENT_STATUSES = [
  "not_required",
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;

export type ConsultPaymentStatus = (typeof CONSULT_PAYMENT_STATUSES)[number];

/** Money, for the consultation fee only. Rupees, no paise, because every
    fee here is a whole number of rupees and "₹99.00" reads like a form. */
export function formatFee(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}
