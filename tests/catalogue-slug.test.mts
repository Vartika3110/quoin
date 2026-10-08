import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* No env setup, unlike most suites here: `@/lib/catalogue-slug` is meant
   to be free of `db`, `env` and Prisma imports so the `tsx` scripts can
   use it without pulling in the app's env validation. If someone adds
   such an import, this file fails to load — which is the point. */
const { slugifyProduct, firstFreeSlug } = await import("@/lib/catalogue-slug");
const { PRODUCT_SLUG_MAX_LENGTH } = await import("@/lib/types/catalog");

describe("slugifyProduct", () => {
  it("lowercases and hyphenates a product name", () => {
    assert.equal(slugifyProduct("UltraTech Cement 50kg"), "ultratech-cement-50kg");
  });

  it("strips accents to the base letter rather than a stray hyphen", () => {
    assert.equal(slugifyProduct("Café"), "cafe");
  });

  it("collapses a run of punctuation into a single hyphen", () => {
    assert.equal(slugifyProduct("Bosch — GBH 2/20 (Professional)"), "bosch-gbh-2-20-professional");
  });

  it("trims leading and trailing hyphens", () => {
    assert.equal(slugifyProduct("  -- Asian Paints -- "), "asian-paints");
  });

  it("falls back to 'item' when nothing alphanumeric survives", () => {
    assert.equal(slugifyProduct("—  /  —"), "item");
  });

  it("falls back to 'item' for an empty name", () => {
    assert.equal(slugifyProduct(""), "item");
  });

  it("collapses punctuation variants of one brand onto the same slug", () => {
    assert.equal(slugifyProduct("Dr Fixit"), slugifyProduct("Dr. Fixit"));
  });
});

describe("firstFreeSlug", () => {
  it("returns the plain slug when nothing has claimed it", () => {
    assert.equal(firstFreeSlug("Dr. Fixit", PRODUCT_SLUG_MAX_LENGTH, new Set()), "dr-fixit");
  });

  it("appends -2 on the first collision", () => {
    const taken = new Set(["dr-fixit"]);
    assert.equal(firstFreeSlug("Dr Fixit", PRODUCT_SLUG_MAX_LENGTH, taken), "dr-fixit-2");
  });

  it("keeps counting past -2", () => {
    const taken = new Set(["dr-fixit", "dr-fixit-2"]);
    assert.equal(firstFreeSlug("Dr Fixit", PRODUCT_SLUG_MAX_LENGTH, taken), "dr-fixit-3");
  });

  it("truncates the slug to maxLength", () => {
    assert.equal(firstFreeSlug("Ultratech Cement Premium", 9, new Set()), "ultratech");
  });

  it("keeps a suffixed slug within maxLength", () => {
    const slug = firstFreeSlug("Ultratech Cement Premium", 9, new Set(["ultratech"]));
    assert.equal(slug, "ultrate-2");
    assert.equal(slug.length, 9);
  });

  it("is pure: it does not add the slug it chose to `taken`", () => {
    const taken = new Set(["dr-fixit"]);
    assert.equal(firstFreeSlug("Dr Fixit", PRODUCT_SLUG_MAX_LENGTH, taken), "dr-fixit-2");
    assert.equal(firstFreeSlug("Dr Fixit", PRODUCT_SLUG_MAX_LENGTH, taken), "dr-fixit-2");
    assert.deepEqual([...taken], ["dr-fixit"]);
  });

  it("assigns distinct slugs across a pass when the caller records each one", () => {
    const taken = new Set<string>();
    const assign = (name: string) => {
      const slug = firstFreeSlug(name, PRODUCT_SLUG_MAX_LENGTH, taken);
      taken.add(slug);
      return slug;
    };
    assert.deepEqual(
      ["Dr Fixit", "Dr. Fixit", "Dr   Fixit"].map(assign),
      ["dr-fixit", "dr-fixit-2", "dr-fixit-3"],
    );
  });
});
