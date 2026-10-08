import { z } from "zod";
import { db } from "@/lib/db";
import {
  checkPrices,
  creatableFulfilment,
  gstRatePct,
  pricingUnit,
  rupees,
} from "@/lib/admin/catalogue-input";
import { reserveProductSlug, reserveVariantSku } from "@/lib/data/catalog-admin";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";

/**
 * A product typed in by hand, rather than imported.
 *
 * `npm run db:import` covers a manufacturer's export; this covers the
 * other case, which is just as ordinary — one line added because a
 * supplier now stocks it. The two have to agree about everything a
 * storefront read depends on, so this route reuses the importer's slug
 * shape, its paise-only money, and its refusal to invent provenance.
 *
 * What it deliberately does not accept:
 *
 *   - `source*`. Those five columns record what a *competitor* listed and
 *     are reference data for pricing only. A row created here has no
 *     competitor listing behind it, and a hand-typed value in them would
 *     be indistinguishable from a captured one.
 *   - `image`. Quoin's own photography fills that column when it exists;
 *     until then the storefront draws a swatch. `/admin/images` is where a
 *     picture gets attached, and it sets `imageIsGenerated` alongside,
 *     which a free-text URL here could not be trusted to do.
 *   - `badges` and `stockTracked`. Merchandising and inventory decisions,
 *     made on their own screens, never as a side effect of creation.
 *   - `INSTANT` fulfilment — see `creatableFulfilment`.
 */
const NewProduct = z
  .object({
    name: z.string().trim().min(2, "Give the product a name").max(200),
    /* The manufacturer's code, and the join key every importer matches
       on. Upper-cased so that "ch-1024" and "CH-1024" cannot become two
       products that are the same thing. */
    sku: z
      .string()
      .trim()
      .min(1, "Enter the product code")
      .max(64)
      .transform((v) => v.toUpperCase()),
    description: z.string().trim().max(4000).default(""),
    brandId: z.string().min(1).nullish(),
    categoryId: z.string().min(1).nullish(),
    gstRatePct: gstRatePct.default(18),
    fulfilment: creatableFulfilment.default("SCHEDULED"),
    pricingUnit: pricingUnit.default("PER_PIECE"),
    leadTimeDays: z.number().int().min(0).max(365).nullish(),

    /* A price, not an option. A product with no variant is invisible in
       the shop and lands in the `/admin/pricing` queue, which is the
       right home for the 880 imported rows that arrived without one — but
       someone adding a single product by hand is adding something they
       intend to sell, and silently creating a hidden row would read as
       the save having failed. */
    mrp: rupees,
    price: rupees,
    proPrice: rupees.nullish(),
    minQty: z.number().int().min(1).max(10_000).default(1),
    stepQty: z.number().int().min(1).max(10_000).default(1),
  })
  .superRefine(checkPrices);

/**
 * POST /api/v1/admin/products
 *
 * Creates a product and its first variant together, in one transaction.
 * Half of this — a product with no variant — is a row that cannot be sold
 * and would have to be found again in another screen to finish.
 */
export const POST = handler(async (request) => {
  await requireStaff();

  const input = await parseBody(request, NewProduct);

  const clash = await db.product.findUnique({
    where: { sku: input.sku },
    select: { slug: true, name: true },
  });
  if (clash) {
    throw new ApiError(
      "conflict",
      `${input.sku} already exists — it is “${clash.name}”`,
      { sku: "This product code is already in the catalogue" },
    );
  }

  /* Resolved rather than connected blind. Both relations are
     `onDelete: Restrict` and a bad id would surface as a foreign-key
     violation — a 500 with a Postgres constraint name in the log, where
     the honest answer is that the brand does not exist. */
  const brand = input.brandId
    ? await db.brand.findUnique({ where: { id: input.brandId }, select: { name: true } })
    : null;
  if (input.brandId && !brand) {
    throw new ApiError("bad_request", "No such brand", { brandId: "Choose a brand" });
  }

  if (input.categoryId) {
    const category = await db.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new ApiError("bad_request", "No such category", {
        categoryId: "Choose a category",
      });
    }
  }

  /* Both reservations read the table to find a free value, so they happen
     before the transaction opens rather than inside it. A collision
     between two staff creating at the same instant is still caught by the
     unique indexes on `slug` and `sku`. */
  const slug = await reserveProductSlug({
    brand: brand?.name,
    name: input.name,
    sku: input.sku,
  });
  const variantSku = await reserveVariantSku(input.sku);

  const product = await db.product.create({
    data: {
      sku: input.sku,
      slug,
      name: input.name,
      description: input.description,
      brandId: input.brandId ?? null,
      categoryId: input.categoryId ?? null,
      gstRatePct: input.gstRatePct,
      fulfilment: input.fulfilment,
      pricingUnit: input.pricingUnit,
      /* Only meaningful for `SCHEDULED` and `MADE_TO_ORDER`; dropped
         rather than stored for anything else, so a later change of
         fulfilment cannot resurrect a lead time nobody chose. */
      leadTimeDays:
        input.fulfilment === "BOOKABLE" ? null : (input.leadTimeDays ?? null),
      variants: {
        create: {
          sku: variantSku,
          label: "Standard",
          mrpPaise: input.mrp,
          pricePaise: input.price,
          proPricePaise: input.proPrice ?? null,
          minQty: input.minQty,
          stepQty: input.stepQty,
          isDefault: true,
        },
      },
    },
    select: { id: true, sku: true, slug: true, name: true },
  });

  return ok(product, { status: 201 });
});
