import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { cartLineSchema, cartLinesSchema, orderLinesSchema } = await import(
  "@/lib/cart/line-schema"
);
const { PRODUCT_SLUG_MAX_LENGTH } = await import("@/lib/types/catalog");

const line = (over: Record<string, unknown> = {}) => ({
  productSlug: "a-real-product",
  variantId: "cmtg0l7hn014fido191pj7b2w",
  qty: 1,
  ...over,
});

/**
 * The regression this file exists for.
 *
 * The checkout capped `productSlug` at 200 characters while both catalogue
 * importers generated them up to 280, so 201 of 3,214 real products could
 * not be quoted or ordered — and because the whole body is rejected at
 * once, a single such item made an entire basket unbuyable. It reached
 * production, because nobody tests with the product that has the longest
 * name.
 */
describe("cart line schema — slug length", () => {
  it("accepts a slug as long as the importers can generate", () => {
    const longest = "x".repeat(PRODUCT_SLUG_MAX_LENGTH);
    assert.equal(cartLineSchema.safeParse(line({ productSlug: longest })).success, true);
  });

  it("still rejects one longer than that", () => {
    const tooLong = "x".repeat(PRODUCT_SLUG_MAX_LENGTH + 1);
    assert.equal(cartLineSchema.safeParse(line({ productSlug: tooLong })).success, false);
  });

  it("leaves room for the real catalogue, not just the constant", () => {
    /* Measured against the live catalogue when this was found: the longest
       slug was exactly 280. If an importer is ever changed to build longer
       ones, this and PRODUCT_SLUG_MAX_LENGTH move together or checkout
       silently loses products again. */
    assert.ok(PRODUCT_SLUG_MAX_LENGTH >= 280);
  });

  it("rejects an empty slug", () => {
    assert.equal(cartLineSchema.safeParse(line({ productSlug: "" })).success, false);
  });
});

describe("cart line schema — quantity", () => {
  it("rejects zero, negative and fractional quantities", () => {
    for (const qty of [0, -1, 1.5]) {
      assert.equal(cartLineSchema.safeParse(line({ qty })).success, false, `qty ${qty}`);
    }
  });

  it("rejects a quantity sent as a string", () => {
    assert.equal(cartLineSchema.safeParse(line({ qty: "1" })).success, false);
  });

  it("accepts a whole quantity", () => {
    assert.equal(cartLineSchema.safeParse(line({ qty: 40 })).success, true);
  });
});

describe("cart line schema — basket shape", () => {
  it("prices an empty basket but refuses to order one", () => {
    assert.equal(cartLinesSchema.safeParse([]).success, true);
    assert.equal(orderLinesSchema.safeParse([]).success, false);
  });

  it("caps a basket at a hundred lines in both", () => {
    const many = Array.from({ length: 101 }, () => line());
    assert.equal(cartLinesSchema.safeParse(many).success, false);
    assert.equal(orderLinesSchema.safeParse(many).success, false);
  });

  it("agrees between quoting and ordering on a line it accepts", () => {
    /* The property that matters: anything quotable must be orderable, or a
       customer is shown a total and then refused at the last step. */
    const basket = [line({ productSlug: "y".repeat(PRODUCT_SLUG_MAX_LENGTH) })];
    assert.equal(cartLinesSchema.safeParse(basket).success, true);
    assert.equal(orderLinesSchema.safeParse(basket).success, true);
  });
});
