import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";

type Ctx = { params: Promise<{ sku: string }> };

/**
 * Rupees in, paise out.
 *
 * The form talks rupees because that is what a merchandiser types; the
 * database stores integer paise, and the conversion happens once, here,
 * rather than being repeated at every call site until one of them
 * forgets and stores rupees in a paise column.
 */
const rupees = z
  .number()
  .positive("Enter an amount greater than zero")
  .max(10_000_000, "That looks like a typo")
  .transform((value) => Math.round(value * 100));

const PriceInput = z
  .object({
    mrp: rupees,
    price: rupees,
    proPrice: rupees.nullish(),
  })
  .refine((v) => v.price <= v.mrp, {
    message: "Sell price cannot exceed the MRP",
    path: ["price"],
  })
  .refine((v) => v.proPrice == null || v.proPrice <= v.price, {
    message: "Pro price cannot exceed the standard sell price",
    path: ["proPrice"],
  });

/**
 * POST /api/v1/admin/products/{sku}/price
 *
 * Gives an imported product its first sellable variant, which is what
 * makes it visible in the storefront at all.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  await requireStaff();

  const { sku } = await params;
  const input = await parseBody(request, PriceInput);

  const product = await db.product.findUnique({
    where: { sku },
    include: { variants: true },
  });
  if (!product) throw new ApiError("not_found", "No such product");

  /* This endpoint exists to price what has never been priced. Editing an
     existing price is a different operation with different consequences —
     it changes what a customer already in a cart was quoted — and it
     should not be reachable by accident from here. */
  if (product.variants.length > 0) {
    throw new ApiError("conflict", "This product already has a price");
  }

  const variant = await db.productVariant.create({
    data: {
      sku: `${sku}-STD`,
      productId: product.id,
      label: "Standard",
      mrpPaise: input.mrp,
      pricePaise: input.price,
      proPricePaise: input.proPrice ?? null,
      minQty: 1,
      stepQty: 1,
      isDefault: true,
    },
  });

  return ok({ sku, variantId: variant.id, pricePaise: variant.pricePaise });
});
