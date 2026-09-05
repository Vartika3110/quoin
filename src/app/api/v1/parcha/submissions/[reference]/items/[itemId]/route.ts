import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import {
  ParchaItemNotFoundError,
  ParchaValidationError,
  updateParchaItem,
} from "@/lib/data/parcha-submissions";

type Ctx = { params: Promise<{ reference: string; itemId: string }> };

const Body = z
  .object({
    accepted: z.boolean().optional(),
    /* A reading of what someone wrote ("2.5 kg"), not a transacted
       quantity — see the schema comment on `ParchaItem.qty`. Not rounded
       here; `normalizeQty` only snaps it onto a variant's integer grid if
       and when it reaches a basket. */
    qty: z.number().finite().positive().max(1_000_000).optional(),
    /* `null` clears a match explicitly, distinct from omitting the field. */
    matchedProductSlug: z.string().trim().min(1).max(200).nullable().optional(),
    matchedVariantId: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .refine(
    (body) =>
      body.accepted !== undefined ||
      body.qty !== undefined ||
      body.matchedProductSlug !== undefined ||
      body.matchedVariantId !== undefined,
    { message: "Nothing to update" },
  );

/**
 * PATCH /api/v1/parcha/submissions/{reference}/items/{itemId}
 *
 * The customer's decision on one line of their list: accept it, reject
 * it, or correct its quantity or matched product. Moving every item out
 * of `null` on `accepted` is what completes the submission — see
 * `statusAfterItemDecisions` in `parcha-submissions.ts`.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const { reference, itemId } = await params;
  const body = await parseBody(request, Body);
  const session = await getSession();

  try {
    const submission = await updateParchaItem({
      reference,
      itemId,
      sessionUserId: session?.userId ?? null,
      accepted: body.accepted,
      qty: body.qty,
      matchedProductSlug: body.matchedProductSlug,
      matchedVariantId: body.matchedVariantId,
    });
    return ok({ submission });
  } catch (error) {
    if (error instanceof ParchaItemNotFoundError) throw new ApiError("not_found", error.message);
    if (error instanceof ParchaValidationError) {
      throw new ApiError("bad_request", error.message, error.fields);
    }
    throw error;
  }
});
