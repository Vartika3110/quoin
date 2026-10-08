import { z } from "zod";
import { db } from "@/lib/db";
import { checkPrices, rupees } from "@/lib/admin/catalogue-input";
import { reserveVariantSku } from "@/lib/data/catalog-admin";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";

type Ctx = { params: Promise<{ sku: string }> };

/**
 * Rupees in, paise out.
 *
 * The form talks rupees because that is what a merchandiser types; the
 * database stores integer paise, and the conversion happens once, in
 * `src/lib/admin/catalogue-input.ts`, rather than being repeated at every
 * call site until one of them forgets and stores rupees in a paise column.
 */
const PriceInput = z
  .object({
    mrp: rupees,
    price: rupees,
    proPrice: rupees.nullish(),
  })
  .superRefine(checkPrices);

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
     should not be reachable by accident from here. That operation is
     `PATCH` below, which names the variant it is changing. */
  if (product.variants.length > 0) {
    throw new ApiError("conflict", "This product already has a price");
  }

  const variant = await db.productVariant.create({
    data: {
      sku: await reserveVariantSku(sku),
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

  return ok({
    sku,
    variantId: variant.id,
    variantSku: variant.sku,
    mrpPaise: variant.mrpPaise,
    pricePaise: variant.pricePaise,
    proPricePaise: variant.proPricePaise,
  });
});

/**
 * The variant is named explicitly rather than inferred from the product.
 *
 * Every product the importer creates has exactly one variant, so "the
 * price of this product" is unambiguous today and would not stay that
 * way: the schema has always allowed several, `resolvePrice` renders the
 * cheapest as an "onwards" price, and the first multi-variant product
 * would silently make a repricing request edit whichever row the database
 * returned first. The caller knows which variant it drew, so it says.
 */
const RepriceInput = z
  .object({
    variantId: z.string().min(1),
    mrp: rupees,
    price: rupees,
    proPrice: rupees.nullish(),
  })
  .superRefine(checkPrices);

/**
 * PATCH /api/v1/admin/products/{sku}/price
 *
 * Changes a price that already exists.
 *
 * Safe to do while customers hold carts, and deliberately so rather than
 * by luck: the browser's cart is a display snapshot and every line is
 * priced again server-side by `quoteCart` before any money is discussed,
 * which reports a changed line back as `price_changed` so the customer
 * sees the new figure before agreeing to it. An order that is already
 * placed is untouched — `OrderLine` froze its own copy of the price.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  await requireStaff();

  const { sku } = await params;
  const input = await parseBody(request, RepriceInput);

  const variant = await db.productVariant.findUnique({
    where: { id: input.variantId },
    include: { product: { select: { sku: true } } },
  });

  /* A variant that belongs to a different product answers the same as one
     that does not exist. The path says which product is being edited and
     the body says which variant; disagreement is a bug in the caller, not
     a licence to edit the row the body happens to name. */
  if (!variant || variant.product.sku !== sku) {
    throw new ApiError("not_found", "No such variant on this product");
  }

  const updated = await db.productVariant.update({
    where: { id: variant.id },
    data: {
      mrpPaise: input.mrp,
      pricePaise: input.price,
      proPricePaise: input.proPrice ?? null,
    },
  });

  return ok({
    sku,
    variantId: updated.id,
    mrpPaise: updated.mrpPaise,
    pricePaise: updated.pricePaise,
    proPricePaise: updated.proPricePaise,
  });
});
