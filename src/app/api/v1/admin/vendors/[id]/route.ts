import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import {
  CostError,
  VendorFieldError,
  VendorNotFoundError,
  markVerified,
  setProductVendor,
  setVariantCost,
  setVendorStatus,
  updateVendor,
} from "@/lib/data/vendors";

type Ctx = { params: Promise<{ id: string }> };

const text = (max: number) => z.string().trim().max(max);

/**
 * PATCH /api/v1/admin/vendors/{id}
 *
 * One route, four shapes, chosen by `action`. They are together because
 * they are the same resource and the same permission, and splitting
 * them into four files would be four copies of the staff check and the
 * error mapping for routes nobody calls from anywhere else.
 *
 *  - `details`  — the form's fields, re-validated by `updateVendor`
 *  - `verify`   — the only way to ACTIVE; demands a note and a payment route
 *  - `status`   — back to draft, or suspended
 *  - `cost`     — what one variant costs, and which vendor supplies a product
 */
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("details"),
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
  }),
  z.object({ action: z.literal("verify"), note: text(500) }),
  z.object({ action: z.literal("status"), status: z.enum(["DRAFT", "PENDING", "SUSPENDED"]) }),
  z.object({
    action: z.literal("cost"),
    variantId: z.string().min(1).max(64),
    /* Null clears it. Absent is not zero — see `setVariantCost`. */
    costPaise: z.number().int().min(0).max(100_000_000).nullable(),
  }),
  z.object({
    action: z.literal("supplies"),
    sku: z.string().min(1).max(64),
    /* Null unlinks the product from this vendor. */
    supplies: z.boolean(),
  }),
]);

export const PATCH = handler(async (request, { params }: Ctx) => {
  await requireStaff();
  const { id } = await params;
  const body = await parseBody(request, Body);

  try {
    switch (body.action) {
      case "details": {
        const vendor = await updateVendor(id, { ...body, email: body.email || undefined });
        return ok({ id: vendor.id });
      }
      case "verify": {
        const vendor = await markVerified(id, body.note);
        return ok({ id: vendor.id, status: vendor.status });
      }
      case "status": {
        await setVendorStatus(id, body.status);
        return ok({ id, status: body.status });
      }
      case "cost": {
        await setVariantCost(body.variantId, body.costPaise);
        return ok({ variantId: body.variantId });
      }
      case "supplies": {
        await setProductVendor(body.sku, body.supplies ? id : null);
        return ok({ sku: body.sku });
      }
    }
  } catch (error) {
    if (error instanceof VendorFieldError) {
      /* `ApiError`'s third argument is the field map itself, which
         `fail` nests under `error.fields` — that is what puts the
         message under the input rather than at the top of the form. */
      throw new ApiError("bad_request", error.message, {
        [error.field]: error.message,
      });
    }
    if (error instanceof VendorNotFoundError) {
      throw new ApiError("not_found", "No such vendor");
    }
    if (error instanceof CostError) {
      throw new ApiError("bad_request", error.message);
    }
    throw error;
  }
});
