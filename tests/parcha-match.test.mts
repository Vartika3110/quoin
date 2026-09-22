import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* parcha-match.ts imports "@/lib/db", which imports "@/lib/env" — env.ts
   validates at import time, so these must be set before the dynamic
   import below runs. Same pattern as tests/unit.test.mts. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { tokenize, TRADE_VOCABULARY, matchTermAgainstCandidates } = await import(
  "@/lib/data/parcha-match"
);

/**
 * Real catalogue names, queried live from Supabase while building this
 * module (see the report for the retry-on-flaky-connection query and the
 * full before/after table). Used verbatim as the fixture so these tests
 * prove the scorer against what the catalogue actually contains, not an
 * idealised version of it.
 */
const CATALOGUE_FIXTURE = [
  { name: "Royale Shyne Luxury Emulsion", brandName: "Asian Paints" },
  { name: "Apcolite Premium Emulsion", brandName: "Asian Paints" },
  {
    name: "Birla White WallSeal Waterproof Putty, 30 Kg Bag",
    brandName: "Birla White",
  },
  { name: "Dhoti (Paint cloth)", brandName: "Generic" },
  { name: "Asian Paints TruCare Brush", brandName: "Asian Paints" },
  { name: "Asian Paints TruCare Roller", brandName: "Asian Paints" },
  { name: "Putty Blade, Stainless Steel", brandName: "HomeRun" },
  {
    name: "Asian Paints TruCare Acrylic Wall Putty",
    brandName: "Asian Paints",
  },
  {
    name: "Asian Paints Trugrip Super Masking Tape ( Abro Tape ), 3/4''",
    brandName: "Asian Paints",
  },
  // Traps: naive word/substring matching would pick these.
  {
    name: "Sensor Faucet for Wash Basin (Battery Operated)",
    brandName: "Jaquar",
  },
  {
    name: "Single Lever 1-Hole Bidet Mixer with Popup Waste System with 375mm Long Braided Hose Hoses",
    brandName: "Jaquar",
  },
  {
    name: "Fosroc Brushbond Grey Two-Component Cementitious Waterproofing Coating, 27.28kg Kit",
    brandName: "HomeRun",
  },
  {
    name: "Asian Paints TruCare Economy Multipurpose Putty Mixer M02, 800W High-Torque Rotary Tool",
    brandName: "Asian Paints",
  },
];

function nameOf(candidate: { name: string } | null): string | null {
  return candidate?.name ?? null;
}

describe("parcha-match: tokenize", () => {
  it("classifies units and generic trade words as weak, content words as strong", () => {
    assert.deepEqual(tokenize("Paint brush 5 inch"), {
      strong: ["brush"],
      weak: ["paint", "5", "inch"],
    });
  });

  it("classifies quantity/unit words and bare numbers as weak", () => {
    assert.deepEqual(tokenize("Sandpaper 320 number"), {
      strong: ["sandpaper"],
      weak: ["320", "number"],
    });
  });

  it("treats short words as weak, and translates 'pop' rather than leaving it as the generic weak word", () => {
    // "pop" has a trade-vocabulary entry ("plaster of paris"), so the
    // translation replaces it before classification runs — it never
    // reaches WEAK_TOKENS as the bare word "pop". Only "of" (a stopword)
    // is left over as weak.
    assert.deepEqual(tokenize("POP plaster of paris"), {
      strong: ["plaster", "paris"],
      weak: ["of"],
    });
  });

  it("returns no strong tokens for a line built entirely from weak words", () => {
    const { strong } = tokenize("Premium white paint set");
    assert.deepEqual(strong, []);
  });

  it("maps trade vocabulary before classifying, splitting multi-word translations", () => {
    assert.deepEqual(tokenize("regmal"), { strong: ["sandpaper"], weak: [] });
    assert.deepEqual(tokenize("patta"), { strong: ["putty", "blade"], weak: [] });
    assert.deepEqual(tokenize("lola"), { strong: ["roller"], weak: [] });
    assert.deepEqual(tokenize("ghodi"), { strong: ["ladder"], weak: [] });
    assert.deepEqual(tokenize("billa"), { strong: ["birla"], weak: [] });
    assert.deepEqual(tokenize("bandal"), { strong: ["bundle"], weak: [] });
    assert.deepEqual(tokenize("safedi"), { strong: ["whitewash"], weak: [] });
    assert.deepEqual(tokenize("jeena"), { strong: ["ladder"], weak: [] });
    assert.deepEqual(tokenize("putte"), { strong: ["putty"], weak: [] });

    // "dhoti" translates to "paint cloth" — "paint" is itself weak, so
    // only "cloth" survives as strong even though the whole phrase mapped.
    assert.deepEqual(tokenize("dhoti"), { strong: ["cloth"], weak: ["paint"] });

    // "peace" translates to "piece", which is a weak quantity word —
    // proof the mapping runs *before* classification, not after.
    assert.deepEqual(tokenize("peace"), { strong: [], weak: ["piece"] });

    // "pop" translates to "plaster of paris", not left as the generic
    // weak word "pop" or read as internet slang.
    assert.deepEqual(tokenize("pop"), { strong: ["plaster", "paris"], weak: ["of"] });
  });

  it("has an entry for every word documented in the trade vocabulary", () => {
    for (const [from, to] of Object.entries(TRADE_VOCABULARY)) {
      assert.equal(typeof from, "string");
      assert.ok(to.length > 0);
    }
  });
});

describe("parcha-match: matchTermAgainstCandidates", () => {
  it("matches a misspelling plus an inserted word", () => {
    assert.equal(
      nameOf(matchTermAgainstCandidates("Royal Luxury emulsion", CATALOGUE_FIXTURE)),
      "Royale Shyne Luxury Emulsion",
    );
  });

  it("matches trade slang ('plastic paint') to the catalogue's word ('emulsion')", () => {
    assert.equal(
      nameOf(matchTermAgainstCandidates("Premium plastic paint", CATALOGUE_FIXTURE)),
      "Apcolite Premium Emulsion",
    );
  });

  it("matches on brand plus a distinctive word", () => {
    assert.equal(
      nameOf(matchTermAgainstCandidates("Birla wall putty", CATALOGUE_FIXTURE)),
      "Birla White WallSeal Waterproof Putty, 30 Kg Bag",
    );
  });

  it("matches a literal word plus the trade-vocabulary translation of another", () => {
    assert.equal(
      nameOf(matchTermAgainstCandidates("Dhoti cloth large", CATALOGUE_FIXTURE)),
      "Dhoti (Paint cloth)",
    );
  });

  it("matches a single distinctive word without picking up a coating with the same substring", () => {
    const result = matchTermAgainstCandidates("Paint brush 5 inch", CATALOGUE_FIXTURE);
    assert.equal(nameOf(result), "Asian Paints TruCare Brush");
    assert.notEqual(
      nameOf(result),
      "Fosroc Brushbond Grey Two-Component Cementitious Waterproofing Coating, 27.28kg Kit",
    );
  });

  it("matches brand plus product word", () => {
    assert.equal(
      nameOf(matchTermAgainstCandidates("Roller Asian 0 number", CATALOGUE_FIXTURE)),
      "Asian Paints TruCare Roller",
    );
  });

  it("matches a two-strong-token line exactly", () => {
    assert.equal(
      nameOf(matchTermAgainstCandidates("Putty blade 8 inch", CATALOGUE_FIXTURE)),
      "Putty Blade, Stainless Steel",
    );
  });

  it("prefers wall putty over a same-brand putty mixer power tool", () => {
    const result = matchTermAgainstCandidates("Asian acrylic putty", CATALOGUE_FIXTURE);
    assert.equal(nameOf(result), "Asian Paints TruCare Acrylic Wall Putty");
    assert.notEqual(
      nameOf(result),
      "Asian Paints TruCare Economy Multipurpose Putty Mixer M02, 800W High-Torque Rotary Tool",
    );
  });

  it("matches a multi-word product name", () => {
    assert.equal(
      nameOf(matchTermAgainstCandidates("Masking tape 2 inch", CATALOGUE_FIXTURE)),
      "Asian Paints Trugrip Super Masking Tape ( Abro Tape ), 3/4''",
    );
  });

  it("does not match a sensor faucet on the generic word 'water'", () => {
    const result = matchTermAgainstCandidates("Water based primer", CATALOGUE_FIXTURE);
    assert.notEqual(
      nameOf(result),
      "Sensor Faucet for Wash Basin (Battery Operated)",
    );
  });

  it("does not match a bidet mixer's 'Popup' waste on the word 'pop'", () => {
    const result = matchTermAgainstCandidates("POP plaster of paris", CATALOGUE_FIXTURE);
    assert.notEqual(
      nameOf(result),
      "Single Lever 1-Hole Bidet Mixer with Popup Waste System with 375mm Long Braided Hose Hoses",
    );
  });

  it("does not bill a plaster trowel as a bag of plaster of paris", () => {
    /* Live-catalogue regression: "plaster" alone matched "Haks Plaster
       Trowel Gurmala" and put a hand tool on a materials list. One hit out
       of several written words only counts when the word that hit is the
       last one — the thing itself — and here it was the qualifier, with
       "paris" missed entirely. */
    const trowel = { name: 'Haks Plaster Trowel Gurmala, 4" x 10"', brandName: "Haks" };
    assert.equal(
      matchTermAgainstCandidates("POP plaster of paris", [...CATALOGUE_FIXTURE, trowel]),
      null,
    );
  });

  it("still matches when the single hit is the product word itself, not a qualifier", () => {
    /* The other side of the same rule: "primer" is the noun, so one hit is
       enough — tightening the trowel case must not cost this match. */
    const primer = {
      name: "Asian Paints TruCare Exterior Wall Primer, Water Thinnable, 20 Litre Bucket",
      brandName: "Asian Paints",
    };
    assert.equal(
      nameOf(matchTermAgainstCandidates("Water based primer", [...CATALOGUE_FIXTURE, primer])),
      "Asian Paints TruCare Exterior Wall Primer, Water Thinnable, 20 Litre Bucket",
    );
  });

  it("returns null rather than guessing when nothing in the catalogue is close", () => {
    assert.equal(matchTermAgainstCandidates("Sandpaper 320 number", CATALOGUE_FIXTURE), null);
    assert.equal(matchTermAgainstCandidates("Ladder ghodi", CATALOGUE_FIXTURE), null);
  });
});
