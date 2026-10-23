import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { parseReading, isVisualSearchContentType } = await import("@/lib/ai/visual-search");
const { parseAssist } = await import("@/lib/ai/assistant");
const { canVisualise, defaultPlacement } = await import("@/lib/ai/eligibility");
const { orientationOf, isPlacement, isVisualisableContentType } = await import(
  "@/lib/ai/visualise"
);
const { INDIAN_BRANDS, FOREIGN_BRANDS, QUOIN_BRANDS, isIndianBrand, isQuoinBrand } =
  await import("@/lib/data/indian-brands");
const { AiError } = await import("@/lib/ai/client");

/**
 * The AI features' validation, which is the part that has to hold when a
 * model answers with something unexpected.
 *
 * Nothing here calls OpenAI. What is tested is the boundary: what the app
 * does with a malformed, over-confident or empty model response, and the
 * two rules that keep the features honest — services cannot be
 * visualised, and a brand is only called Indian if somebody put it on a
 * list.
 */

const DEPARTMENTS = [
  { slug: "tiling-adhesives", name: "Tiling & adhesives" },
  { slug: "bathware-plumbing", name: "Bathware & plumbing" },
];

const SERVICES = [{ slug: "plumbing" }, { slug: "painting" }];

describe("parseReading (photo search)", () => {
  it("reads a well-formed answer", () => {
    const reading = parseReading(
      JSON.stringify({
        summary: "A bathroom floor with grey tiles.",
        guesses: [
          {
            label: "Matte grey floor tile",
            keywords: ["tile", "floor", "ceramic"],
            categorySlug: "tiling-adhesives",
            brand: null,
            detail: "matte ceramic",
          },
        ],
      }),
      DEPARTMENTS,
    );

    assert.equal(reading.summary, "A bathroom floor with grey tiles.");
    assert.equal(reading.guesses.length, 1);
    assert.equal(reading.guesses[0].categorySlug, "tiling-adhesives");
    assert.deepEqual(reading.guesses[0].keywords, ["tile", "floor", "ceramic"]);
  });

  it("drops a category slug the catalogue does not have", () => {
    /* A model that answers with its own taxonomy — "Sanitaryware" — must
       not produce a filter that matches nothing. The guess survives; the
       slug does not. */
    const reading = parseReading(
      JSON.stringify({
        summary: "",
        guesses: [
          {
            label: "Wash basin",
            keywords: ["basin", "washbasin"],
            categorySlug: "sanitaryware",
            brand: null,
            detail: null,
          },
        ],
      }),
      DEPARTMENTS,
    );

    assert.equal(reading.guesses.length, 1, "the identification is kept");
    assert.equal(reading.guesses[0].categorySlug, null, "the invented slug is dropped");
  });

  it("splits a phrase handed back in the keyword slot", () => {
    const reading = parseReading(
      JSON.stringify({
        summary: "",
        guesses: [
          {
            label: "Concealed hinge",
            keywords: ["concealed hinge", "soft close"],
            categorySlug: null,
            brand: null,
            detail: null,
          },
        ],
      }),
      DEPARTMENTS,
    );

    /* Phrases in the keyword slot are a `contains` lookup that matches
       nothing, so they are split into words. */
    assert.deepEqual(reading.guesses[0].keywords, ["concealed", "hinge", "soft", "close"]);
  });

  it("drops a guess with no searchable keyword", () => {
    const reading = parseReading(
      JSON.stringify({
        summary: "",
        guesses: [
          { label: "Something", keywords: [], categorySlug: null, brand: null, detail: null },
          {
            label: "Floor tile",
            keywords: ["tile"],
            categorySlug: null,
            brand: null,
            detail: null,
          },
        ],
      }),
      DEPARTMENTS,
    );

    /* A chip that returns nothing when tapped is worse than one that is
       not there. */
    assert.equal(reading.guesses.length, 1);
    assert.equal(reading.guesses[0].label, "Floor tile");
  });

  it("refuses a response that is not JSON", () => {
    assert.throws(() => parseReading("not json at all", DEPARTMENTS), (error: unknown) => {
      assert.ok(error instanceof AiError);
      assert.equal(error.failure, "invalid_response");
      return true;
    });
  });

  it("refuses a response of the wrong shape", () => {
    assert.throws(
      () => parseReading(JSON.stringify({ items: [] }), DEPARTMENTS),
      (error: unknown) => {
        assert.ok(error instanceof AiError);
        assert.equal(error.failure, "invalid_response");
        return true;
      },
    );
  });

  it("returns empty rather than throwing when the model found nothing", () => {
    /* "Nothing in this photo" is an answer, not a malfunction — the route
       turns it into a sentence and a 200. */
    const reading = parseReading(JSON.stringify({ summary: "A cat.", guesses: [] }), DEPARTMENTS);
    assert.deepEqual(reading.guesses, []);
  });

  it("accepts only image types a model can read", () => {
    assert.equal(isVisualSearchContentType("image/jpeg"), true);
    assert.equal(isVisualSearchContentType("image/webp"), true);
    assert.equal(isVisualSearchContentType("IMAGE/PNG"), true);
    assert.equal(isVisualSearchContentType("image/jpeg; charset=binary"), true);
    /* HEIC is converted in the browser before upload — OpenAI will not
       take it. */
    assert.equal(isVisualSearchContentType("image/heic"), false);
    assert.equal(isVisualSearchContentType("application/pdf"), false);
  });
});

describe("parseAssist (voice)", () => {
  it("reads a product request", () => {
    const reading = parseAssist(
      JSON.stringify({
        intent: "product",
        reply: "Looking for anti-skid bathroom floor tiles.",
        guesses: [
          {
            label: "Anti-skid floor tile",
            keywords: ["tile", "antiskid", "floor"],
            categorySlug: "tiling-adhesives",
            brand: null,
            detail: null,
          },
        ],
        serviceSlugs: [],
        followUp: "How many square feet?",
        suggestConsult: false,
      }),
      { departments: DEPARTMENTS, services: SERVICES },
    );

    assert.equal(reading.intent, "product");
    assert.equal(reading.guesses.length, 1);
    assert.equal(reading.followUp, "How many square feet?");
    assert.equal(reading.suggestConsult, false);
  });

  it("drops a service slug that does not exist", () => {
    const reading = parseAssist(
      JSON.stringify({
        intent: "service",
        reply: "",
        guesses: [],
        serviceSlugs: ["plumbing", "roofing", "plumbing"],
        followUp: null,
        suggestConsult: false,
      }),
      { departments: DEPARTMENTS, services: SERVICES },
    );

    /* An unknown slug is a link to a 404, and a duplicate is the same
       card twice. */
    assert.deepEqual(reading.serviceSlugs, ["plumbing"]);
  });

  it("falls back to unclear for an unrecognised intent", () => {
    const reading = parseAssist(
      JSON.stringify({
        intent: "something_else",
        reply: "",
        guesses: [],
        serviceSlugs: [],
        followUp: null,
        suggestConsult: false,
      }),
      { departments: DEPARTMENTS, services: SERVICES },
    );
    assert.equal(reading.intent, "unclear");
  });

  it("carries suggestConsult through only when it is literally true", () => {
    const read = (value: unknown) =>
      parseAssist(
        JSON.stringify({
          intent: "unclear",
          reply: "",
          guesses: [],
          serviceSlugs: [],
          followUp: null,
          suggestConsult: value,
        }),
        { departments: DEPARTMENTS, services: SERVICES },
      ).suggestConsult;

    assert.equal(read(true), true);
    assert.equal(read("true"), false);
    assert.equal(read(1), false);
  });
});

describe("canVisualise", () => {
  it("allows an ordinary product", () => {
    assert.equal(
      canVisualise({ fulfilment: "scheduled", pricingUnit: "per_sqft" }, "tiling-adhesives"),
      true,
    );
  });

  it("refuses a bookable product", () => {
    /* `BOOKABLE` is defined in the schema as "No stock at all. Consumes a
       professional's time slot" — there is nothing to place in a photo. */
    assert.equal(
      canVisualise({ fulfilment: "bookable", pricingUnit: "per_piece" }, "plumbing"),
      false,
    );
  });

  it("refuses anything priced per visit", () => {
    assert.equal(
      canVisualise({ fulfilment: "scheduled", pricingUnit: "per_visit" }, "tools-safety"),
      false,
    );
  });

  it("refuses the services department", () => {
    assert.equal(
      canVisualise({ fulfilment: "scheduled", pricingUnit: "per_piece" }, "services"),
      false,
    );
  });

  it("works with no category at all", () => {
    assert.equal(canVisualise({ fulfilment: "scheduled", pricingUnit: "per_piece" }), true);
    assert.equal(canVisualise({ fulfilment: "bookable", pricingUnit: "per_piece" }, null), false);
  });
});

describe("placement defaults", () => {
  it("sends tiles to the floor and ceilings to the ceiling", () => {
    assert.equal(defaultPlacement("tiling-adhesives"), "floor");
    assert.equal(defaultPlacement("gypsum-false-ceiling"), "ceiling");
    assert.equal(defaultPlacement("kitchen-sinks-faucets"), "worktop");
    assert.equal(defaultPlacement("paints-finishes"), "wall");
  });

  it("falls through to the placement that is never wrong", () => {
    assert.equal(defaultPlacement("hardware-locks"), "in_place");
    assert.equal(defaultPlacement(undefined), "in_place");
    assert.equal(defaultPlacement("a-department-invented-later"), "in_place");
  });

  it("only ever returns a real placement", () => {
    for (const slug of [
      "tiling-adhesives",
      "paints-finishes",
      "gypsum-false-ceiling",
      "kitchen-sinks-faucets",
      "anything-else",
      null,
    ]) {
      assert.equal(isPlacement(defaultPlacement(slug)), true, `${slug}`);
    }
  });
});

describe("render orientation", () => {
  it("matches the room photograph's shape", () => {
    assert.equal(orientationOf(4000, 3000), "landscape");
    assert.equal(orientationOf(3000, 4000), "portrait");
    assert.equal(orientationOf(2000, 2000), "square");
  });

  it("treats a nearly-square photo as square", () => {
    assert.equal(orientationOf(1000, 1000), "square");
    assert.equal(orientationOf(1100, 1000), "square");
  });

  it("falls back to square for a shape it cannot measure", () => {
    /* A dimension the browser could not read must not produce a render
       with its sides cropped off. */
    assert.equal(orientationOf(Number.NaN, 100), "square");
    assert.equal(orientationOf(0, 0), "square");
    assert.equal(orientationOf(-10, 100), "square");
  });

  it("accepts only image types the editor takes", () => {
    assert.equal(isVisualisableContentType("image/jpeg"), true);
    assert.equal(isVisualisableContentType("image/heic"), false);
  });
});

describe("Rooted brand lists", () => {
  it("never puts a brand on both lists", () => {
    /* The foreign list exists to make the Indian one auditable. An
       overlap would mean the page is claiming and disclaiming the same
       company. */
    const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const indian = new Set([...INDIAN_BRANDS, ...QUOIN_BRANDS].map(normalise));
    const clashes = FOREIGN_BRANDS.filter((name) => indian.has(normalise(name)));
    assert.deepEqual(clashes, [], "a brand cannot be both Indian and foreign");
  });

  it("recognises Indian manufacturers however they are spelled", () => {
    assert.equal(isIndianBrand("Asian Paints"), true);
    assert.equal(isIndianBrand("ASIAN PAINTS"), true);
    assert.equal(isIndianBrand("asian-paints"), true);
    assert.equal(isIndianBrand("Jaquar"), true);
    assert.equal(isIndianBrand("UltraTech Cement"), false, "the list holds 'ultratech'");
  });

  it("does not claim foreign brands", () => {
    for (const name of ["Hettich", "Häfele", "Blum", "Grohe", "Bosch", "Legrand"]) {
      assert.equal(isIndianBrand(name), false, `${name} must not be on Rooted`);
    }
  });

  it("leaves an unclassified brand off the page entirely", () => {
    /* The right failure: a gap somebody notices and fills, rather than a
       false claim on the one page whose proposition is provenance. */
    assert.equal(isIndianBrand("Some Brand The Importer Invented"), false);
  });

  it("knows which brands are Quoin's own", () => {
    assert.equal(isQuoinBrand("Mars"), true);
    assert.equal(isQuoinBrand("MARS"), true);
    assert.equal(isQuoinBrand("Jaquar"), false);
    /* Still Indian, and also ours — two separate facts, both true. */
    assert.equal(isIndianBrand("Mars"), true);
  });
});
