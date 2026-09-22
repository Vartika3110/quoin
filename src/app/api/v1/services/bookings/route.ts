import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import { ProjectKindSchema } from "@/lib/data/projects";
import {
  ServiceBookingAddressNotFoundError,
  ServiceBookingFilesNotFoundError,
  ServiceBookingModeNotAllowedError,
  ServiceBookingProjectNotFoundError,
  ServiceBookingScheduleInvalidError,
  ServiceBookingScheduleRequiredError,
  ServiceBookingSiteRequiredError,
  ServiceNotFoundError,
  createServiceBooking,
  listBookingsForUser,
  serviceBookingErrorCode,
} from "@/lib/data/service-bookings";

/**
 * Service bookings.
 *
 * Open only to signed-in customers — a booking or a quote request carries
 * a site address and a phone Quoin will call, which is exactly the kind
 * of thing `/api/v1/consultations` deliberately does *not* require an
 * account for. This is a heavier commitment than a callback request, and
 * it lives in the account from the moment it is created.
 */

/** Blank means "not answered" — see the same helper in
    `/api/v1/consultations`. Without this a field the form renders but the
    customer left empty arrives as `""` and reads, downstream, like a real
    answer. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const Body = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  kind: z.enum(["BOOKING", "QUOTE"]),

  projectId: optionalText(40),
  newProjectName: optionalText(120),

  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a day")
    .optional(),
  preferredSlot: z.enum(["morning", "afternoon", "evening"]).optional(),

  addressId: optionalText(40),
  siteLine: optionalText(300),
  siteCity: optionalText(120),
  sitePincode: z
    .union([z.literal(""), z.string().regex(/^\d{6}$/, "A pincode is six digits")])
    .optional()
    .transform((v) => (v ? v : undefined)),

  projectKind: ProjectKindSchema.optional(),
  areaSqft: z.number().int().min(1).max(1_000_000).optional(),

  requirements: z
    .string()
    .trim()
    .min(10, "Say a little more about the work")
    .max(2000),
  notes: optionalText(1000),

  fileIds: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

/** Turns this module's typed errors into the field a step-based form can
    highlight — see `ServiceBookingFlow`, which maps each key back to the
    step that owns it. */
function fieldsFor(error: unknown): Record<string, string> | undefined {
  if (error instanceof ServiceNotFoundError) return { serviceSlug: error.message };
  if (error instanceof ServiceBookingModeNotAllowedError) return { kind: error.message };
  if (
    error instanceof ServiceBookingScheduleRequiredError ||
    error instanceof ServiceBookingScheduleInvalidError
  ) {
    return { preferredDate: error.message };
  }
  if (error instanceof ServiceBookingProjectNotFoundError) return { projectId: error.message };
  if (error instanceof ServiceBookingAddressNotFoundError) return { addressId: error.message };
  if (error instanceof ServiceBookingSiteRequiredError) return { siteLine: error.message };
  if (error instanceof ServiceBookingFilesNotFoundError) return { fileIds: error.message };
  return undefined;
}

/**
 * POST /api/v1/services/bookings
 *
 * Writes a booking (a preferred day, fixed scope) or a quote request (open
 * scope, priced after Quoin sees it). `createServiceBooking` is the actual
 * authority on which kind a service accepts, whether a day is choosable,
 * and whether the project, address and files this body names are really
 * this caller's — this route only shapes and bounds the input.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, Body);

  try {
    const booking = await createServiceBooking(user.id, body);
    return ok({ booking }, { status: 201 });
  } catch (error) {
    const code = serviceBookingErrorCode(error);
    if (code) throw new ApiError(code, (error as Error).message, fieldsFor(error));
    throw error;
  }
});

/**
 * GET /api/v1/services/bookings
 *
 * The caller's own bookings and quote requests. `?projectId=` narrows to
 * one project's — the same query a project's own "Services" tab reads.
 */
export const GET = handler(async (request) => {
  const user = await requireUser();
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const bookings = await listBookingsForUser(user.id, { projectId });
  return ok({ bookings });
});
