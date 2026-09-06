import { z } from "zod";
import { PRODUCT_SLUG_MAX_LENGTH } from "@/lib/types/catalog";

/**
 * What the client is allowed to say about one line of a basket.
 *
 * Shared by `/checkout/quote` and `/checkout/order` because they must
 * agree: a basket that can be priced has to be a basket that can be
 * ordered, and the two accepting different shapes is a customer being
 * quoted a total and then refused at the last step.
 *
 * They were separate copies of the same object literal until a slug limit
 * in one of them was found to be too small for the catalogue — the kind of
 * drift that only shows up on the products nobody tests with. One
 * definition, one place to change.
 *
 * Note what is *not* here. No price, no tax, no total: the client states
 * what it wants to buy and never what it costs. Every amount is recomputed
 * server-side from the catalogue, and a body claiming a figure has that
 * claim discarded rather than validated.
 */
export const cartLineSchema = z.object({
  /* Long, because manufacturer product names are. See the note on
     PRODUCT_SLUG_MAX_LENGTH: a Jaquar description alone runs past 200
     characters, and a cap below what the importers generate silently made
     6% of the catalogue impossible to buy. */
  productSlug: z.string().min(1).max(PRODUCT_SLUG_MAX_LENGTH),
  variantId: z.string().min(1).max(64),
  /* Integer: `normalizeQty` snaps every quantity onto the variant's own
     grid before it reaches a cart, so a fraction here is a client that has
     bypassed it. Capped so one request cannot become a hundred thousand
     rows of arithmetic. */
  qty: z.number().int().positive().max(100_000),
});

export type CartLineInput = z.infer<typeof cartLineSchema>;

/** A basket that may legitimately be empty — pricing nothing costs nothing. */
export const cartLinesSchema = z.array(cartLineSchema).max(100);

/** A basket that is about to become an order, which cannot be empty. */
export const orderLinesSchema = z.array(cartLineSchema).min(1).max(100);
