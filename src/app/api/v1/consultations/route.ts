import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import { InvalidPhoneError, normalizePhone } from "@/lib/auth/phone";
import { getSession } from "@/lib/auth/session";
import {
  countRequestsSince,
  createConsultRequest,
  listConsultRequests,
} from "@/lib/data/consultations";
import { getAreaChoice } from "@/lib/data/service-areas";
import { addDays, CONSULT_HORIZON_DAYS, istDay } from "@/lib/types/consult";

/**
 * Consultations.
 *
 * Open to anyone: asking Quoin to call you back does not require an
 * account, and the storefront has no sign-in screen to send someone to.
 * That makes the endpoint an unauthenticated write, so it is deliberately
 * cheap to police — a normalised phone, a hard cap per number per day, and
 * nothing on the row that a stranger could use to reach another customer.
 */

/**
 * An empty input is "not answered", not "answered with nothing".
 *
 * The form posts every field it renders, so without this a blank optional
 * box arrives as `""` and lands in the database as an empty string that
 * reads, to whoever picks the request up, exactly like a real answer.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const Body = z.object({
  mode: z.enum(["video", "site_visit"]),

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
  /* Long enough for a real brief, short enough that the column is not a
     free file upload. */
  notes: optionalText(1000),

  preferredDate: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a day")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  preferredSlot: z.enum(["morning", "afternoon", "evening"]).optional(),
});

/** Five call-backs a day from one number is already generous for a human. */
const MAX_REQUESTS_PER_DAY = 5;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/v1/consultations
 *
 * Records a request for a call back. It is not a booking, and the response
 * says so — nothing here reserves a professional's time.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, Body);

  let phone: string;
  try {
    phone = normalizePhone(body.phone);
  } catch (error) {
    if (error instanceof InvalidPhoneError) {
      throw new ApiError("bad_request", error.message, { phone: error.message });
    }
    throw error;
  }

  /* A window without a day is not a request anyone can act on — "evening"
     alone tells the person calling back nothing about which evening. */
  if (body.preferredSlot && !body.preferredDate) {
    throw new ApiError("bad_request", "Pick a day for that time window", {
      preferredDate: "Pick a day",
    });
  }

  if (body.preferredDate) {
    const today = istDay(new Date());
    const last = addDays(today, CONSULT_HORIZON_DAYS);
    /* String comparison is exact for `YYYY-MM-DD`, and avoids parsing the
       customer's day into an instant only to compare it back. */
    if (body.preferredDate < today || body.preferredDate > last) {
      throw new ApiError(
        "bad_request",
        `Pick a day within the next ${CONSULT_HORIZON_DAYS} days`,
        { preferredDate: "Pick a day in the next two weeks" },
      );
    }
  }

  /* Checked against the live list rather than trusted: the slug is stored
     as a foreign key and read back onto the page, and an area with no
     store is not somewhere an expert can actually be sent. */
  const area = body.areaSlug ? await getAreaChoice(body.areaSlug) : null;
  if (body.areaSlug && !area) {
    throw new ApiError("bad_request", "We do not operate there yet", {
      areaSlug: "Pick an area from the list",
    });
  }

  /* A visit needs somewhere to go. A video call does not, which is why
     this is checked per mode rather than made required on the column. */
  if (body.mode === "site_visit" && !area && !body.pincode) {
    throw new ApiError("bad_request", "Tell us where the site is", {
      areaSlug: "Pick an area, or enter the site pincode",
    });
  }

  const recent = await countRequestsSince(phone, new Date(Date.now() - RATE_WINDOW_MS));
  if (recent >= MAX_REQUESTS_PER_DAY) {
    throw new ApiError(
      "rate_limited",
      "You already have several requests open. We will call you back on those first.",
    );
  }

  /* Attached when there is a session, but never required. The row is the
     lead either way; the link just means a signed-in customer's history
     is complete once the account screens exist. */
  const session = await getSession();

  const consultation = await createConsultRequest({
    mode: body.mode,
    name: body.name,
    phone,
    email: body.email,
    userId: session?.userId,
    areaSlug: area?.slug,
    pincode: body.pincode,
    categorySlug: body.categorySlug,
    notes: body.notes,
    preferredDate: body.preferredDate,
    preferredSlot: body.preferredSlot,
  });

  return ok({ consultation }, { status: 201 });
});

/**
 * GET /api/v1/consultations — the operations queue.
 *
 * Staff only, and it exists so the POST above is not a write nobody can
 * read. The console that will render this properly is module 8; until then
 * this is how a request gets acted on.
 */
export const GET = handler(async () => {
  await requireStaff();
  return ok({ consultations: await listConsultRequests() });
});
