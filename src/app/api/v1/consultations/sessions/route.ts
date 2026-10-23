import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import { InvalidPhoneError, normalizePhone } from "@/lib/auth/phone";
import { db } from "@/lib/db";
import { getAreaChoice } from "@/lib/data/service-areas";
import { countRequestsSince } from "@/lib/data/consultations";
import { BookingError, createBooking } from "@/lib/data/consult-sessions";
import {
  createGatewayOrder,
  isRazorpayConfigured,
  razorpayKeyId,
  RazorpayError,
} from "@/lib/payments/razorpay";
import {
  addDays,
  CONSULT_DURATION_MINUTES,
  CONSULT_HORIZON_DAYS,
  CONSULT_START_MINUTES,
  CONSULT_TOPIC_INFO,
  CONSULT_TOPICS,
  istDay,
} from "@/lib/types/consult";

/**
 * POST /api/v1/consultations/sessions
 *
 * Books a paid video consultation: reserves the slot, creates the gateway
 * order, and hands the browser what it needs to open Razorpay's checkout.
 *
 * ## What this route does and does not do
 *
 * It takes **no money**. It creates a row that holds a time for fifteen
 * minutes and a Razorpay order to pay against. The appointment becomes
 * real when `payment.captured` reaches `POST /api/v1/webhooks/razorpay`
 * and `settleConsultationPayment` writes it — the same single-source rule
 * orders follow, and for the same reason: a browser's success callback
 * proves Razorpay answered it, not that a bank captured anything.
 *
 * ## The order of the two writes
 *
 * The gateway order is created **before** the row, and that ordering is
 * deliberate. The other way round, a gateway failure leaves a reserved
 * slot nobody can pay for, blocking a real customer for the length of the
 * hold. This way a gateway failure leaves an unused Razorpay order, which
 * costs nothing and expires on their side. `razorpayOrderId` is unique on
 * the row, so the order can never be booked against twice.
 *
 * Open to guests, like the call-back request beside it. Asking somebody to
 * create an account before they can pay ₹99 to ask a question loses the
 * customer at the only step that matters.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const Body = z.object({
  topic: z.enum(CONSULT_TOPICS as [string, ...string[]]),

  /** IST calendar day. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a day"),
  /** Minutes past midnight IST. Validated against the real grid below. */
  startMinutes: z.number().int().min(0).max(24 * 60),

  name: z.string().trim().min(2, "Tell us who to ask for").max(80),
  phone: z.string().min(1, "Enter your mobile number"),
  email: z
    .union([z.literal(""), z.email("Enter a valid email address").max(160)])
    .optional()
    .transform((v) => (v ? v : undefined)),

  areaSlug: optionalText(80),
  pincode: z
    .union([z.literal(""), z.string().regex(/^\d{6}$/, "A pincode is six digits")])
    .optional()
    .transform((v) => (v ? v : undefined)),

  categorySlug: optionalText(120),
  /** The question itself. Long enough for a real brief. */
  notes: optionalText(1000),
});

/** The same cap the free request uses, and for the same reason: this is a
    human being's time, and five open bookings from one number is already
    more than anybody genuinely needs. */
const MAX_PER_DAY = 5;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  if (!isRazorpayConfigured()) {
    /* The honest state while gateway KYC is pending, and the one the free
       call-back request exists to cover. Not a 500: nothing is broken. */
    throw new ApiError(
      "conflict",
      "Paid consultations are not switched on yet. Request a free call back instead and an expert will ring you.",
    );
  }

  const body = await parseBody(request, Body);
  const topic = body.topic as (typeof CONSULT_TOPICS)[number];

  let phone: string;
  try {
    phone = normalizePhone(body.phone);
  } catch (error) {
    if (error instanceof InvalidPhoneError) {
      throw new ApiError("bad_request", error.message, { phone: error.message });
    }
    throw error;
  }

  /* String comparison is exact for `YYYY-MM-DD` and avoids parsing the
     day into an instant only to compare it back — the same check the
     free request makes. */
  const today = istDay(new Date());
  if (body.day < today || body.day > addDays(today, CONSULT_HORIZON_DAYS)) {
    throw new ApiError("bad_request", `Pick a day within the next ${CONSULT_HORIZON_DAYS} days`, {
      day: "Pick a day in the next two weeks",
    });
  }

  /* Validated against the real grid rather than a range: a request for
     14:07 is not a slot anybody is free for, and accepting it would put a
     time on a receipt that the calendar does not have. */
  if (!CONSULT_START_MINUTES.includes(body.startMinutes)) {
    throw new ApiError("bad_request", "Pick one of the start times offered", {
      startMinutes: "Pick a time from the list",
    });
  }

  /* Two reads, two different questions. `getAreaChoice` answers "is this
     somewhere Quoin actually operates", which means a live store — an
     area row alone is not that. The id then comes from the table, because
     the column is a foreign key and the slug is the customer's input. */
  const area = body.areaSlug ? await getAreaChoice(body.areaSlug) : null;
  if (body.areaSlug && !area) {
    throw new ApiError("bad_request", "We do not operate there yet", {
      areaSlug: "Pick an area from the list",
    });
  }
  const areaRow = area
    ? await db.serviceArea.findUnique({ where: { slug: area.slug }, select: { id: true } })
    : null;

  /* Resolved to an id rather than stored as a slug, and checked, for the
     reason the free request gives: it is a foreign key read back onto the
     page. */
  const category = body.categorySlug
    ? await db.category.findFirst({
        where: { slug: body.categorySlug, isActive: true },
        select: { id: true },
      })
    : null;

  const recent = await countRequestsSince(phone, new Date(Date.now() - RATE_WINDOW_MS));
  if (recent >= MAX_PER_DAY) {
    throw new ApiError(
      "rate_limited",
      "You already have several consultations open. Let us get through those first.",
    );
  }

  const session = await getSession();
  const fee = CONSULT_TOPIC_INFO[topic].feePaise;

  /* Created first — see the note at the top of this file. The receipt is
     not the booking reference, because the reference does not exist yet;
     the phone and the slot are what reconciles a stray order by hand. */
  let gateway;
  try {
    gateway = await createGatewayOrder({
      amountPaise: fee,
      receipt: `consult-${Date.now()}`,
      notes: {
        kind: "consultation",
        topic,
        day: body.day,
        startMinutes: String(body.startMinutes),
      },
    });
  } catch (error) {
    if (error instanceof RazorpayError) {
      /* Logged here, not echoed: a gateway's message is written for an
         integrator. The same discipline the checkout routes follow. */
      console.error("[consult] gateway order failed", { message: error.message });
      throw new ApiError(
        "conflict",
        "We could not start the payment just now. Try again in a moment.",
      );
    }
    throw error;
  }

  let booking;
  try {
    booking = await createBooking({
      topic,
      day: body.day,
      startMinutes: body.startMinutes,
      name: body.name,
      phone,
      email: body.email,
      userId: session?.userId,
      areaId: areaRow?.id,
      pincode: body.pincode,
      categoryId: category?.id,
      notes: body.notes,
      razorpayOrderId: gateway.id,
    });
  } catch (error) {
    if (error instanceof BookingError) {
      /* `conflict`, not `bad_request`: the request was well formed and
         the world moved underneath it. The form refetches availability
         on this and shows the customer what is left. */
      throw new ApiError(
        error.refusal === "slot_taken" ? "conflict" : "bad_request",
        error.message,
      );
    }
    throw error;
  }

  return ok({
    reference: booking.reference,
    feePaise: booking.feePaise,
    startsAt: booking.startsAt.toISOString(),
    durationMinutes: CONSULT_DURATION_MINUTES,
    /* What the browser needs to open the checkout. The key id is not a
       secret — it is handed to the browser precisely so it can — and the
       room is deliberately *not* here: it is only released once the fee
       is captured. See `getBookingByReference`. */
    razorpayOrderId: gateway.id,
    razorpayKeyId: razorpayKeyId(),
    holdMinutes: 15,
  });
});
