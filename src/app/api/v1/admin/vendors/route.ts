import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import { VendorFieldError, createVendor } from "@/lib/data/vendors";

/** Long enough for a legal name with a trust and a district in it. */
const text = (max: number) => z.string().trim().max(max);

const Body = z.object({
  legalName: text(160),
  tradeName: text(160).optional(),
  gstin: text(20).optional(),
  pan: text(12).optional(),
  phone: text(20),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  addressLine: text(200).optional(),
  city: text(80).optional(),
  state: text(80).optional(),
  pincode: text(10).optional(),
  bankAccountName: text(160).optional(),
  bankAccountNumber: text(24).optional(),
  bankIfsc: text(16).optional(),
  upiVpa: text(120).optional(),
  paymentTermsDays: z.number().int().min(1).max(90).optional(),
  notes: text(1000).optional(),
});

/**
 * POST /api/v1/admin/vendors
 *
 * Adds a vendor, always as a draft.
 *
 * The zod schema above is only the shape — lengths and a plausible
 * email. Everything that makes an identifier *right* (a GSTIN's
 * checksum, an IFSC's reserved zero, a PAN that disagrees with the one
 * inside the GSTIN) is checked in `createVendor`, because a second
 * writer — an import, a script — must meet the same rules as this
 * route. See the note at the top of `src/lib/data/vendors.ts`.
 *
 * A `VendorFieldError` names the field it came from, which is what lets
 * the form put the message under the input that caused it rather than
 * at the top of the page.
 */
export const POST = handler(async (request) => {
  await requireStaff();
  const body = await parseBody(request, Body);

  try {
    const vendor = await createVendor({ ...body, email: body.email || undefined });
    return ok({ id: vendor.id });
  } catch (error) {
    if (error instanceof VendorFieldError) {
      /* `ApiError`'s third argument is the field map itself, which
         `fail` nests under `error.fields` — that is what puts the
         message under the input rather than at the top of the form. */
      throw new ApiError("bad_request", error.message, {
        [error.field]: error.message,
      });
    }
    throw error;
  }
});
