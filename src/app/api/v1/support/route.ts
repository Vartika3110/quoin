import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  SUPPORT_CATEGORY_SLUGS,
  SupportRateLimitedError,
  SupportReferenceNotFoundError,
  createSupportRequest,
  listSupportRequestsForUser,
} from "@/lib/data/support";

/**
 * Help & Support requests.
 *
 * Behind sign-in on both verbs, unlike `/api/v1/consultations` — a
 * consultation is a lead from anyone, but a support request is always
 * about *this account's* orders, bookings and history, so there is
 * nowhere useful to route one filed by a stranger.
 */

const Body = z.object({
  category: z.enum(SUPPORT_CATEGORY_SLUGS),
  subject: z.string().trim().min(3, "Say a little about what this is").max(120),
  message: z.string().trim().min(10, "Tell us a bit more").max(2000),
  /* Bounded to a real reference's shape (`QO-XXXXXX`, six characters after
     the prefix) rather than the request's category — a stray value here
     is resolved against the database either way, never trusted. */
  orderReference: z.string().trim().max(40).optional(),
  bookingReference: z.string().trim().max(40).optional(),
});

export const POST = handler(async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, Body);

  try {
    const supportRequest = await createSupportRequest(user.id, body);
    return ok({ request: supportRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof SupportReferenceNotFoundError) {
      throw new ApiError("not_found", error.message);
    }
    if (error instanceof SupportRateLimitedError) {
      throw new ApiError("rate_limited", error.message);
    }
    throw error;
  }
});

/** GET /api/v1/support — the caller's own requests, newest first. */
export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ requests: await listSupportRequestsForUser(user.id) });
});
