import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser, viewerId } from "@/lib/http";
import { PRODUCT_SLUG_MAX_LENGTH } from "@/lib/types/catalog";
import {
  listOpenStockAlertVariantIds,
  requestStockAlert,
} from "@/lib/data/stock-alerts";

const Body = z.object({
  productSlug: z.string().min(1).max(PRODUCT_SLUG_MAX_LENGTH),
  variantId: z.string().min(1).max(64),
});

/**
 * GET /api/v1/stock-alerts — the variants the viewer has asked about.
 *
 * Public, and empty for a signed-out visitor rather than a 401: the cart
 * asks on every load, and a guest's cart is not an error.
 */
export const GET = handler(async () => {
  const userId = await viewerId();
  return ok({ variantIds: userId ? await listOpenStockAlertVariantIds(userId) : [] });
});

/**
 * POST /api/v1/stock-alerts — asks to hear when a variant is back.
 *
 * Behind sign-in because the request is only useful to someone staff can
 * reach. See `src/lib/data/stock-alerts.ts` for what happens next.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const input = await parseBody(request, Body);

  const result = await requestStockAlert(user, input);
  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        throw new ApiError("not_found", "This product is no longer in the catalogue.");
      case "not_tracked":
        throw new ApiError("bad_request", "This product is not out of stock.");
      case "no_contact":
        throw new ApiError(
          "bad_request",
          "Add a phone number in Settings so our team can reach you.",
        );
    }
  }

  return ok({ variantId: result.variantId }, { status: 201 });
});
