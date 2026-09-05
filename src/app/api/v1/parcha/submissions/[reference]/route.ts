import { ApiError, handler, ok } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import { getSubmissionByReference } from "@/lib/data/parcha-submissions";

type Ctx = { params: Promise<{ reference: string }> };

/**
 * GET /api/v1/parcha/submissions/{reference}
 *
 * Public, deliberately: a guest can create a submission with no account
 * (see `POST` on the parent route), so a guest must be able to read it
 * back too. Ownership is enforced inside `getSubmissionByReference` only
 * for a submission that actually has an owner — a guest's has the
 * unguessable reference as its only credential, exactly as the schema
 * comment on `ParchaSubmission.userId` describes.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const { reference } = await params;
  const session = await getSession();

  const submission = await getSubmissionByReference(reference, session?.userId ?? null);
  if (!submission) throw new ApiError("not_found", "No such submission");

  return ok({ submission });
});
