import { z } from "zod";

/**
 * Money and enum input for the catalogue tools, in one place.
 *
 * Three routes now accept a price — first price, repricing, and creating a
 * product with one — and a fourth copy of "multiply by a hundred and
 * round" is how rupees eventually get written into a paise column. The
 * conversion happens here and nowhere else.
 */

/** Rupees in, integer paise out. */
export const rupees = z
  .number()
  .positive("Enter an amount greater than zero")
  .max(10_000_000, "That looks like a typo")
  .transform((value) => Math.round(value * 100));

export interface PriceTriple {
  mrp: number;
  price: number;
  proPrice?: number | null;
}

/**
 * The two rules every price on this catalogue obeys.
 *
 * A sell price above the MRP prints a strikethrough that is an *increase*
 * on the product card — `resolveVariantPrice` shows `mrp` struck through
 * whenever it exceeds the amount charged — and a Pro rate above the
 * standard one makes a trade account the most expensive way to buy.
 * Neither is a judgement call a merchandiser should be able to make by
 * mistyping a digit.
 */
export function priceIssues(v: PriceTriple): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];

  if (v.price > v.mrp) {
    issues.push({ path: "price", message: "Sell price cannot exceed the MRP" });
  }
  if (v.proPrice != null && v.proPrice > v.price) {
    issues.push({
      path: "proPrice",
      message: "Pro price cannot exceed the standard sell price",
    });
  }

  return issues;
}

/** Applies `priceIssues` as Zod issues, so they arrive as field errors. */
export function checkPrices(v: PriceTriple, ctx: z.RefinementCtx): void {
  for (const issue of priceIssues(v)) {
    ctx.addIssue({ code: "custom", message: issue.message, path: [issue.path] });
  }
}

/**
 * The GST slabs that exist. An integer rather than an enum in the schema
 * because it is arithmetic on every invoice line, but the *input* is a
 * closed set, and a typo'd `1.8` here is a tax error on every sale.
 */
export const GST_SLABS = [0, 5, 12, 18, 28] as const;

export const gstRatePct = z
  .number()
  .int()
  .refine((v) => (GST_SLABS as readonly number[]).includes(v), {
    message: "GST must be one of 0, 5, 12, 18 or 28",
  });

/**
 * How a hand-added product can be fulfilled.
 *
 * `INSTANT` is absent, and that is the same decision the importer makes
 * for the same reason: it claims a dark store within range is holding the
 * item, which is an inventory fact. `Product.stockTracked` defaults to
 * off, so an `INSTANT` product created here would promise eighteen
 * minutes with no stock check behind it at all. Merchandising promotes a
 * line to instant once stock is counted in through `/admin/inventory`.
 */
export const creatableFulfilment = z.enum(["SCHEDULED", "BOOKABLE", "MADE_TO_ORDER"]);

export const pricingUnit = z.enum([
  "PER_PIECE",
  "PER_SQFT",
  "PER_RUNNING_FT",
  "PER_VISIT",
  "PER_BAG",
  "PER_LITRE",
  "PER_KG",
]);
