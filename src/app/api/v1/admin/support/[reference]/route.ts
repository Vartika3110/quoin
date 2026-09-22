import { SupportStatus } from "@prisma/client";
import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import {
  SupportRequestNotFoundError,
  getSupportRequestForStaff,
  updateSupportStatus,
} from "@/lib/data/support";

type Ctx = { params: Promise<{ reference: string }> };

/** GET /api/v1/admin/support/{reference} — one request, staff only. */
export const GET = handler(async (_request, { params }: Ctx) => {
  await requireStaff();
  const { reference } = await params;

  const request = await getSupportRequestForStaff(reference);
  if (!request) throw new ApiError("not_found", "No such support request");

  return ok({ request });
});

const Body = z.object({
  status: z.nativeEnum(SupportStatus),
});

/**
 * PATCH /api/v1/admin/support/{reference}
 *
 * Moves a request between Open, In progress and Resolved. Thin on
 * purpose: `updateSupportStatus` (`src/lib/data/support.ts`) is the only
 * place that decides what a status write means for `resolvedAt`.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  await requireStaff();
  const { reference } = await params;
  const { status } = await parseBody(request, Body);

  try {
    const supportRequest = await updateSupportStatus(reference, status);
    return ok({ request: supportRequest });
  } catch (error) {
    if (error instanceof SupportRequestNotFoundError) {
      throw new ApiError("not_found", "No such support request");
    }
    throw error;
  }
});
