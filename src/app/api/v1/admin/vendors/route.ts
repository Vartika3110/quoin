import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import {
  InvalidVendorError,
  VendorConflictError,
  createVendor,
  listVendors,
} from "@/lib/data/admin-vendors";

const Body = z.object({
  code: z.string().trim().min(2).max(32),
  name: z.string().trim().min(2).max(80),
  contactName: z.string().trim().max(80).optional(),
  /* Not validated as a phone number here — `validateVendor` normalises it
     through the same `normalizePhone` every customer number goes through
     and returns a field-level message. A Zod regex would be a second,
     looser idea of a valid Indian mobile number sitting in front of the
     real one. */
  whatsappPhone: z.string().trim().max(24).optional(),
  lat: z.number(),
  lng: z.number(),
  serviceRadiusKm: z.number(),
  baseEtaMinutes: z.number(),
  serviceAreaId: z.string().trim().max(64).optional(),
});

/**
 * POST /api/v1/admin/vendors
 *
 * Adds a vendor — which in this schema is a `Store`, because what holds
 * the stock an order line reserved and what gets the new-order WhatsApp
 * are the same shop.
 *
 * Thin, like every other admin route here: the rules live in
 * `createVendor` (`src/lib/data/admin-vendors.ts`), which is also where
 * the one thing worth knowing about this endpoint is written down — the
 * store is created **inactive**, always, and that is not a parameter.
 * An active store immediately becomes the nearest-in-radius store for
 * every address it covers, and a new store has no stock, so creating one
 * live would break checkout for those addresses the moment the form was
 * submitted.
 *
 * Returns the whole refreshed list rather than the new row, so the page
 * re-renders from one source of truth instead of splicing a row whose
 * shape the client has guessed.
 */
export const POST = handler(async (request) => {
  await requireStaff();
  const body = await parseBody(request, Body);

  try {
    await createVendor(body);
  } catch (error) {
    if (error instanceof InvalidVendorError) {
      throw new ApiError("bad_request", error.message, error.fields);
    }
    if (error instanceof VendorConflictError) {
      throw new ApiError("conflict", error.message, error.fields);
    }
    throw error;
  }

  return ok({ vendors: await listVendors() });
});
