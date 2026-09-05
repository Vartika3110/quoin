import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import {
  ParchaFileError,
  callerIp,
  checkGuestRateLimit,
  hashIp,
  checkUserRateLimit,
  createTypedSubmission,
  createUploadSubmission,
} from "@/lib/data/parcha-submissions";

const Body = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("typed"),
    /* Bounded the same way `/api/v1/parcha`'s `terms` array is — a full
       bill of quantities is a conversation with an expert, not a paste
       into a text box, and an unbounded body is an unbounded number of
       catalogue lookups per request. */
    rawText: z.string().trim().min(1, "Type or paste your list").max(8000),
  }),
  z.object({
    source: z.literal("upload"),
    fileId: z.string().min(1),
  }),
]);

/**
 * POST /api/v1/parcha/submissions
 *
 * Persists a materials list — typed, or a previously-uploaded file — so a
 * customer can leave and come back to it and staff can see a queue that
 * needs a human. Public, like `/api/v1/parcha` and `/api/v1/checkout/quote`:
 * pricing a list is exactly what someone does before deciding whether to
 * make an account (see the schema comment on `ParchaSubmission.userId`).
 *
 * That makes this an unauthenticated write, so it is rate-limited the way
 * OTP requests and consultation call-backs are — see the comment on
 * `checkGuestRateLimit` in `parcha-submissions.ts` for why guests and
 * signed-in callers are limited by two different mechanisms.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, Body);
  const session = await getSession();
  const userId = session?.userId ?? null;

  /* Computed once and reused: it is both the rate-limit key and the
     column written onto a guest's row, and hashing the same address twice
     with different inputs would silently create two buckets. */
  const ipHash = userId ? null : hashIp(callerIp(request.headers));

  const limit = userId
    ? await checkUserRateLimit(userId)
    : await checkGuestRateLimit(ipHash!);

  if (!limit.allowed) {
    throw new ApiError(
      "rate_limited",
      "You have submitted several lists recently. Please try again in a little while.",
    );
  }

  if (body.source === "typed") {
    const submission = await createTypedSubmission({ userId, rawText: body.rawText, ipHash });
    return ok({ submission }, { status: 201 });
  }

  try {
    const submission = await createUploadSubmission({ userId, fileId: body.fileId, ipHash });
    return ok({ submission }, { status: 201 });
  } catch (error) {
    /* Not-found rather than forbidden, for the same reason `requireStaff`
       answers 404 to someone signed in but unauthorised: confirming a
       file id exists but belongs to someone else is itself a disclosure. */
    if (error instanceof ParchaFileError) throw new ApiError("not_found", error.message);
    throw error;
  }
});
