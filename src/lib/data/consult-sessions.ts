import { Prisma } from "@prisma/client";
import type {
  ConsultPaymentStatus as DbPaymentStatus,
  ConsultTopic as DbTopic,
} from "@prisma/client";
import { db } from "@/lib/db";
import { REFERENCE_ATTEMPTS, generateReference } from "@/lib/reference";
import { mintRoomName } from "@/lib/consult/video";
import {
  CONSULT_CONCURRENT_EXPERTS,
  CONSULT_DURATION_MINUTES,
  CONSULT_HOLD_MINUTES,
  CONSULT_START_MINUTES,
  CONSULT_TOPIC_INFO,
  istInstant,
  istMinutes,
  startIsBookable,
  type ConsultPaymentStatus,
  type ConsultTopic,
} from "@/lib/types/consult";

/**
 * Paid video consultations: availability, booking and settlement.
 *
 * Separate from `consultations.ts`, which owns the free call-back request
 * and the site visit. That module's own comment states the rule it was
 * written to: "A row here is demand, not a booking… nothing in this file
 * reserves anyone's time." This one is the opposite — a row here *is* a
 * booking, because the customer has paid for a named twenty minutes — so
 * mixing the two would mean one module with two contradictory promises in
 * it.
 *
 * Both write the same table. What separates a booking from a request is
 * `startsAt` and `topic` being set, which is also what the availability
 * query counts.
 */

/** ---- Mapping ------------------------------------------------------------
 * Written out in both directions rather than derived with `toUpperCase()`,
 * for the reason `consultations.ts` records: a `Record` keyed on the union
 * is exhaustive, so adding a value to the schema fails the build here
 * instead of becoming `undefined` the moment a customer submits.
 */

const TO_DB_TOPIC: Record<ConsultTopic, DbTopic> = {
  repair: "REPAIR",
  products: "PRODUCTS",
  interior: "INTERIOR",
};

const FROM_DB_TOPIC: Record<DbTopic, ConsultTopic> = {
  REPAIR: "repair",
  PRODUCTS: "products",
  INTERIOR: "interior",
};

const FROM_DB_PAYMENT: Record<DbPaymentStatus, ConsultPaymentStatus> = {
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

/** `QC`, the same prefix the free requests use — they are the same table
    and the same thing to a customer reading a code out on the phone. */
const REFERENCE_PREFIX = "QC";

/** ---- Availability ------------------------------------------------------- */

/**
 * Which of the day's start times are already taken, and by how many.
 *
 * Counts `PAID` bookings always, and `PENDING` ones only while their hold
 * is still alive — an abandoned payment sheet must not keep a 6pm slot
 * off the board all evening. Nothing sweeps those rows: the hold simply
 * stops counting, which means there is no cron job to forget to run and
 * no state that can be left stale. The row survives as the honest record
 * that somebody started and did not finish.
 *
 * One query for a whole fortnight, not one per day.
 */
export async function bookedStarts(input: {
  from: Date;
  to: Date;
  now?: Date;
}): Promise<Map<number, number>> {
  const now = input.now ?? new Date();
  const holdFloor = new Date(now.getTime() - CONSULT_HOLD_MINUTES * 60_000);

  const rows = await db.consultRequest.findMany({
    where: {
      startsAt: { gte: input.from, lte: input.to },
      status: { not: "CANCELLED" },
      OR: [
        { paymentStatus: "PAID" },
        { paymentStatus: "PENDING", createdAt: { gte: holdFloor } },
      ],
    },
    select: { startsAt: true },
  });

  /* Keyed on the epoch millisecond rather than on a formatted string: two
     representations of the same instant must collide, and a string is one
     formatting decision away from not colliding. */
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (!row.startsAt) continue;
    const at = row.startsAt.getTime();
    counts.set(at, (counts.get(at) ?? 0) + 1);
  }
  return counts;
}

export interface DayAvailability {
  /** `YYYY-MM-DD` in IST. */
  day: string;
  /** Minutes past midnight IST, for the starts still bookable. */
  starts: number[];
}

/**
 * The bookable grid for a run of days.
 *
 * Returns only what can actually be booked — a picker that offers a slot
 * the server then refuses is worse than a shorter list, because the
 * customer has already chosen by the time they are told.
 */
export async function listAvailability(input: {
  days: string[];
  now?: Date;
}): Promise<DayAvailability[]> {
  if (input.days.length === 0) return [];
  const now = input.now ?? new Date();

  const sorted = [...input.days].sort();
  const from = istInstant(sorted[0], CONSULT_START_MINUTES[0]);
  const to = istInstant(
    sorted[sorted.length - 1],
    CONSULT_START_MINUTES[CONSULT_START_MINUTES.length - 1],
  );

  const taken = await bookedStarts({ from, to, now });

  return input.days.map((day) => ({
    day,
    starts: CONSULT_START_MINUTES.filter((minutes) =>
      startIsBookable({
        startsAt: istInstant(day, minutes),
        now,
        taken: taken.get(istInstant(day, minutes).getTime()) ?? 0,
      }),
    ),
  }));
}

/** ---- Booking ----------------------------------------------------------- */

/** Why a booking could not be taken. Each one is a different sentence to
    the customer, which is why they are distinct values and not a boolean. */
export type BookingRefusal =
  /** Somebody else took the last place at that time while this customer
      was filling the form. */
  | "slot_taken"
  /** The time has passed, or is inside the notice window. */
  | "too_soon"
  /** No reference code could be minted. Vanishingly rare; see below. */
  | "reference";

export class BookingError extends Error {
  constructor(readonly refusal: BookingRefusal, message: string) {
    super(message);
    this.name = "BookingError";
  }
}

export interface NewBooking {
  id: string;
  reference: string;
  feePaise: number;
  videoRoom: string;
  startsAt: Date;
}

/**
 * Reserves a slot and returns the row to take payment against.
 *
 * The row is written `PENDING_PAYMENT` / `PENDING` and holds its slot for
 * `CONSULT_HOLD_MINUTES`. It becomes a real appointment only when
 * `payment.captured` arrives at the webhook — see
 * `settleConsultationPayment`. Nothing here marks anything paid, and
 * nothing here may be changed to.
 *
 * ## Serializable, on purpose
 *
 * Checking "is there room at 4pm" and then inserting is a textbook race:
 * under the default READ COMMITTED, two customers booking the last place
 * both read one-taken and both insert, and the second one has paid for a
 * call nobody is free for. `Serializable` makes the loser fail instead,
 * with a Postgres serialization error that is caught below and turned
 * into `slot_taken` — which is the truth, and a sentence the customer can
 * act on.
 *
 * The alternative is a unique constraint on something like
 * `(startsAt, seatIndex)`, which is exact without a retry. It is the
 * right change the day capacity comes out of a constant and into a roster
 * table; until then this is one isolation level rather than a synthetic
 * column with no meaning of its own.
 */
export async function createBooking(input: {
  topic: ConsultTopic;
  /** IST calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Minutes past midnight IST, from `CONSULT_START_MINUTES`. */
  startMinutes: number;
  name: string;
  /** E.164, already normalised by the route. */
  phone: string;
  email?: string;
  userId?: string;
  areaId?: string;
  pincode?: string;
  categoryId?: string;
  notes?: string;
  /** Razorpay's order id, created before this call so a failed gateway
      does not leave a reserved slot behind. */
  razorpayOrderId: string;
  now?: Date;
}): Promise<NewBooking> {
  const now = input.now ?? new Date();
  const startsAt = istInstant(input.day, input.startMinutes);

  if (!CONSULT_START_MINUTES.includes(input.startMinutes)) {
    throw new BookingError("too_soon", "That is not one of our start times.");
  }

  const fee = CONSULT_TOPIC_INFO[input.topic].feePaise;

  try {
    return await db.$transaction(
      async (tx) => {
        const taken = await tx.consultRequest.count({
          where: {
            startsAt,
            status: { not: "CANCELLED" },
            OR: [
              { paymentStatus: "PAID" },
              {
                paymentStatus: "PENDING",
                createdAt: { gte: new Date(now.getTime() - CONSULT_HOLD_MINUTES * 60_000) },
              },
            ],
          },
        });

        if (!startIsBookable({ startsAt, now, taken })) {
          throw new BookingError(
            taken >= CONSULT_CONCURRENT_EXPERTS ? "slot_taken" : "too_soon",
            taken >= CONSULT_CONCURRENT_EXPERTS
              ? "That time has just been taken. Pick another."
              : "That time is too close now. Pick a later one.",
          );
        }

        /* Reference codes are random, so a collision is possible and
           retried rather than prevented — the same loop every other
           reference in this app uses. */
        for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
          const reference = generateReference(REFERENCE_PREFIX);
          try {
            const row = await tx.consultRequest.create({
              data: {
                reference,
                /* Always `VIDEO`: a site visit is not sold by the minute
                   and goes through the other module. */
                mode: "VIDEO",
                status: "PENDING_PAYMENT",
                topic: TO_DB_TOPIC[input.topic],
                feePaise: fee,
                paymentStatus: "PENDING",
                razorpayOrderId: input.razorpayOrderId,
                startsAt,
                durationMinutes: CONSULT_DURATION_MINUTES,
                /* Minted now rather than on confirmation, so both sides
                   have had the same stable link from the start. */
                videoRoom: mintRoomName(),
                name: input.name,
                phone: input.phone,
                email: input.email,
                userId: input.userId,
                areaId: input.areaId,
                pincode: input.pincode,
                categoryId: input.categoryId,
                notes: input.notes,
                /* Kept in step with `startsAt` so the operations queue,
                   which reads the day and the window, shows a paid
                   booking alongside the free requests rather than with
                   two empty columns. */
                preferredDate: new Date(`${input.day}T00:00:00Z`),
                preferredSlot:
                  input.startMinutes < 12 * 60
                    ? "MORNING"
                    : input.startMinutes < 16 * 60
                      ? "AFTERNOON"
                      : "EVENING",
              },
              select: {
                id: true,
                reference: true,
                feePaise: true,
                videoRoom: true,
                startsAt: true,
              },
            });

            return {
              id: row.id,
              reference: row.reference,
              feePaise: row.feePaise,
              /* Both non-null by construction above; the select cannot
                 express that, so it is asserted once here rather than at
                 every call site. */
              videoRoom: row.videoRoom as string,
              startsAt: row.startsAt as Date,
            };
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002" &&
              /* Only a reference or room collision is retryable. A
                 duplicate `razorpayOrderId` means this gateway order has
                 already been booked against, and retrying would mint a
                 second booking for one payment. */
              !String(error.meta?.target ?? "").includes("razorpayOrderId")
            ) {
              continue;
            }
            throw error;
          }
        }

        throw new BookingError(
          "reference",
          "We could not start that booking. Try again in a moment.",
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof BookingError) throw error;
    /* Postgres serialization failure — the loser of a race for the last
       place at a time. Not an error the customer caused, and the honest
       reading of it is that the slot went. */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      throw new BookingError("slot_taken", "That time has just been taken. Pick another.");
    }
    throw error;
  }
}

/** ---- Settlement -------------------------------------------------------- */

export type ConsultSettlement =
  /** Captured and written. The appointment is real from here. */
  | "recorded"
  /** Already recorded — a redelivered webhook. */
  | "duplicate"
  /** No consultation holds this gateway order. The caller should try the
      order tables before concluding anything. */
  | "unknown"
  /** Captured for an amount that is not the fee. Needs a person. */
  | "amount_mismatch";

/**
 * Moves a consultation to PAID, from `payment.captured` on the webhook.
 *
 * **The only function in this codebase that may do that**, and the same
 * rule orders follow: `verifyCheckoutSignature` proves the browser saw a
 * genuine Razorpay response, which is not the same claim as money having
 * moved, and it arrives over a channel the customer controls.
 *
 * Idempotent, because Razorpay retries on any non-2xx and can deliver a
 * success twice. A second delivery finds the row already `PAID` with the
 * same payment id and answers `duplicate` without writing.
 */
export async function settleConsultationPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
}): Promise<ConsultSettlement> {
  const row = await db.consultRequest.findUnique({
    where: { razorpayOrderId: input.providerOrderId },
    select: {
      id: true,
      feePaise: true,
      paymentStatus: true,
      razorpayPaymentId: true,
    },
  });
  if (!row) return "unknown";

  if (row.paymentStatus === "PAID") {
    /* A *different* payment id against a booking already paid for means
       the customer was charged twice — two capture events for one
       gateway order. Nothing is written (the appointment is already
       real), but it is logged loudly, because what it needs is a refund
       and a person, not a retry. */
    if (row.razorpayPaymentId !== input.providerPaymentId) {
      console.error("[consult] second capture against a paid consultation", {
        providerOrderId: input.providerOrderId,
        recorded: row.razorpayPaymentId,
        incoming: input.providerPaymentId,
      });
    }
    return "duplicate";
  }

  /* A capture for less than the fee is a discrepancy, not a sale — the
     same check `settleCapturedPayment` makes against an order total. The
     row is left unpaid and the mismatch is the webhook's to shout about. */
  if (input.amountPaise !== row.feePaise) {
    await db.consultRequest.update({
      where: { id: row.id },
      data: { razorpayPaymentId: input.providerPaymentId },
    });
    return "amount_mismatch";
  }

  await db.consultRequest.update({
    where: { id: row.id },
    data: {
      paymentStatus: "PAID",
      razorpayPaymentId: input.providerPaymentId,
      paidAt: new Date(),
      /* Out of PENDING_PAYMENT and into the operations queue. Not
         SCHEDULED: the time is the customer's choice and is held, but a
         human still confirms who is taking the call. */
      status: "REQUESTED",
    },
  });
  return "recorded";
}

/** Records a failed attempt. The slot's hold runs out on its own. */
export async function recordFailedConsultPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
}): Promise<ConsultSettlement> {
  const row = await db.consultRequest.findUnique({
    where: { razorpayOrderId: input.providerOrderId },
    select: { id: true, paymentStatus: true },
  });
  if (!row) return "unknown";
  /* A failure after a capture is not a failure of this booking. Leave a
     PAID row alone — the customer has an appointment. */
  if (row.paymentStatus === "PAID") return "duplicate";

  await db.consultRequest.update({
    where: { id: row.id },
    data: { paymentStatus: "FAILED", razorpayPaymentId: input.providerPaymentId },
  });
  return "recorded";
}

/** ---- Reading one back -------------------------------------------------- */

export interface BookingView {
  reference: string;
  topic: ConsultTopic | null;
  status: string;
  paymentStatus: ConsultPaymentStatus;
  feePaise: number;
  /** ISO instant, or null for a free request made through the other flow. */
  startsAt: string | null;
  durationMinutes: number;
  /** Only ever populated for a paid booking — see the route. */
  videoRoom: string | null;
  name: string;
  notes: string | null;
  createdAt: string;
}

/**
 * One booking, by reference.
 *
 * The phone is deliberately not selected. `maskPhone` exists for the
 * places a number has to be shown back; this view is rendered on a
 * confirmation page that is reachable from a link, and a masked number is
 * still four real digits of somebody's phone on a page a stranger with
 * the URL can open.
 */
export async function getBookingByReference(reference: string): Promise<BookingView | null> {
  const row = await db.consultRequest.findUnique({
    where: { reference },
    select: {
      reference: true,
      topic: true,
      status: true,
      paymentStatus: true,
      feePaise: true,
      startsAt: true,
      durationMinutes: true,
      videoRoom: true,
      name: true,
      notes: true,
      createdAt: true,
    },
  });
  if (!row) return null;

  return {
    reference: row.reference,
    topic: row.topic ? FROM_DB_TOPIC[row.topic] : null,
    status: row.status.toLowerCase(),
    paymentStatus: FROM_DB_PAYMENT[row.paymentStatus],
    feePaise: row.feePaise,
    startsAt: row.startsAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes ?? CONSULT_DURATION_MINUTES,
    /* The room is only a secret worth keeping for a booking that was
       actually paid for — and only a paid booking has a call to join. An
       unpaid row's room is withheld rather than deleted, so paying later
       does not need a new one. */
    videoRoom: row.paymentStatus === "PAID" ? row.videoRoom : null,
    name: row.name,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The IST start-minute of a booking, for rendering its time. */
export function startMinutesOf(startsAt: Date): number {
  return istMinutes(startsAt);
}
