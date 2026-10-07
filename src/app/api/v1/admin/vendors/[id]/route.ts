import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import {
  EmptyStoreActivationError,
  InvalidVendorError,
  VendorNotFoundError,
  listVendors,
  setVendorActive,
  updateVendorContact,
} from "@/lib/data/admin-vendors";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.union([
  z.object({
    action: z.literal("contact"),
    /** `null` or empty clears the number, which stops vendor messages. */
    whatsappPhone: z.string().trim().max(24).nullable(),
    contactName: z.string().trim().max(80).nullable(),
  }),
  z.object({
    action: z.literal("active"),
    isActive: z.boolean(),
    /** Set by the UI after the operator answers the question that
        `EmptyStoreActivationError` asks. */
    acknowledgeEmptyStock: z.boolean().optional(),
  }),
]);

/**
 * PATCH /api/v1/admin/vendors/{id}
 *
 * Two deliberately separate actions on one route, discriminated by
 * `action`, because they have nothing in common but the row they touch:
 *
 * - **`contact`** — the WhatsApp number and who to ask for. This is the
 *   fix for a vendor notification that failed with "no WhatsApp number on
 *   file", so it is one field and one button. It cannot move a store,
 *   change its reach, or switch it on.
 * - **`active`** — the consequential one. Activating a store makes it the
 *   nearest-in-radius store for every address it covers, and a store with
 *   no stock then fails to reserve for all of them. `setVendorActive`
 *   refuses that case with `EmptyStoreActivationError` unless the caller
 *   has acknowledged it; the UI turns the refusal into a question with
 *   the consequence written out rather than swallowing it.
 *
 * A single `PATCH` taking every column would let one careless request do
 * both, and would make "fill in a phone number" and "put a store live"
 * look like the same kind of edit. They are not.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  await requireStaff();
  const { id } = await params;
  const body = await parseBody(request, Body);

  try {
    if (body.action === "contact") {
      await updateVendorContact({
        id,
        whatsappPhone: body.whatsappPhone,
        contactName: body.contactName,
      });
    } else {
      await setVendorActive({
        id,
        isActive: body.isActive,
        acknowledgeEmptyStock: body.acknowledgeEmptyStock,
      });
    }
  } catch (error) {
    if (error instanceof VendorNotFoundError) {
      throw new ApiError("not_found", "No such vendor");
    }
    if (error instanceof InvalidVendorError) {
      throw new ApiError("bad_request", error.message, error.fields);
    }
    if (error instanceof EmptyStoreActivationError) {
      /* 409 rather than 400: nothing the operator typed is wrong, the
         store is simply not in a state where this is safe yet. The
         message carries the consequence, and the UI re-asks with
         `acknowledgeEmptyStock`. */
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }

  return ok({ vendors: await listVendors() });
});
