import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* No env setup and no `db`: `@/lib/product-types` is a table of terms
   and two pure functions over it, and it stays that way so the rule can
   be tested — and run by a `tsx` script — without a database. An import
   of Prisma or env here fails this file at load. */
const {
  PRODUCT_TYPES,
  WORD_SAFE_ACRONYMS,
  classifyProductType,
  productTypeTerms,
  productTypesFor,
} = await import("@/lib/product-types");

describe("the type tables themselves", () => {
  it("gives every type a unique id within its department", () => {
    for (const [slug, types] of Object.entries(PRODUCT_TYPES)) {
      const ids = types.map((t) => t.id);
      assert.equal(new Set(ids).size, ids.length, `${slug} repeats a type id`);
    }
  });

  it("never leaves a type with nothing to match on", () => {
    for (const [slug, types] of Object.entries(PRODUCT_TYPES)) {
      for (const type of types) {
        assert.ok(type.match.length > 0, `${slug}/${type.id} has no terms`);
      }
    }
  });

  /* The terms are substrings of a lowercased name, so a short one is a
     trap: "tap" is inside "Tape", "led" is inside "Bundled", "ply" is
     inside "Greenply". Anything under four characters has to carry a
     neighbouring space or comma to pin it to a word boundary, unless it
     is a trade code that cannot appear inside a word. */
  it("pins every short term to a word boundary", () => {
    for (const [slug, types] of Object.entries(PRODUCT_TYPES)) {
      for (const type of types) {
        for (const term of type.match) {
          if (term.trim().length >= 4) continue;
          if (WORD_SAFE_ACRONYMS.has(term.trim())) continue;
          assert.match(
            term,
            /[ ,]/,
            `${slug}/${type.id}: "${term}" is short and unanchored`,
          );
        }
      }
    }
  });

  /* The allowlist is an exception to a safety rule, so it is kept to
     what is actually used — an entry nothing matches is an exception
     granted to nothing. */
  it("grants no unused exceptions to the anchoring rule", () => {
    const used = new Set(
      Object.values(PRODUCT_TYPES).flatMap((types) =>
        types.flatMap((type) => type.match.map((term) => term.trim())),
      ),
    );
    for (const acronym of WORD_SAFE_ACRONYMS) {
      assert.ok(used.has(acronym), `"${acronym}" is allowlisted but unused`);
    }
  });

  it("holds no types for a department too small to have shelves", () => {
    assert.deepEqual(productTypesFor("kitchen-sinks-faucets"), []);
    assert.deepEqual(productTypesFor("gypsum-false-ceiling"), []);
    assert.deepEqual(productTypesFor(undefined), []);
  });
});

describe("classifyProductType", () => {
  const bathware = (name: string) => classifyProductType("bathware-plumbing", name);

  const plumbing = (name: string) => classifyProductType("plumbing-fittings", name);

  it("files a product under the first type it matches", () => {
    assert.equal(bathware("Jaquar ABS Overhead Shower"), "showers");
    assert.equal(plumbing("Ashirvad Flowguard Plus CPVC 90° Elbow"), "pipes-fittings");
  });

  /* Pipework moved to its own department. Nothing in bathware should
     still answer for it — the two are different shelves for different
     buyers now, and a product matching in both would mean the split had
     not actually happened. */
  it("keeps pipework out of bathware", () => {
    assert.equal(bathware("Ashirvad Flowguard Plus CPVC 90° Elbow"), undefined);
    assert.equal(bathware("Ball Valve Long Handle CPVC"), undefined);
    assert.equal(bathware("Bottle trap"), undefined);
  });

  it("orders the plumbing shelves so a waste beats a pipe", () => {
    assert.equal(plumbing("Collapsible Waste Pipe"), "wastes-traps");
    assert.equal(plumbing("Ball Valve Long Handle CPVC"), "valves");
    assert.equal(plumbing("Pipe 10ft CPVC"), "pipes-fittings");
  });

  /* The whole reason the list is ordered. A shower mixer is a shower,
     and it says "Mixer" on the box. */
  it("resolves an overlap by declaration order", () => {
    assert.equal(
      bathware("Aquamax Exposed Part Kit of Single Lever Shower Mixer (Alive)"),
      "showers",
    );
    assert.equal(bathware("Jaquar Wall Mounted Single Lever Basin Mixer"), "taps-mixers");
  });

  it("reads the three spellings of WC", () => {
    assert.equal(bathware("WC Connector 6x4"), "wc-cisterns");
    assert.equal(bathware("Jaquar Rimless Wall Hung WC, Continental"), "wc-cisterns");
    assert.equal(bathware("Jaquar Rimless Wall Hung WC | Kubix Prime"), "wc-cisterns");
  });

  /* The trap this guards is real: "tap" is a substring of "Tape", and
     the tiling department sells masking tape. */
  it("does not read a tape as a tap", () => {
    assert.notEqual(bathware("Teflon Tape"), "taps-mixers");
    assert.equal(bathware("Washing machine tap"), "taps-mixers");
  });

  it("leaves a name that matches nothing unfiled", () => {
    assert.equal(bathware("Hexa Blade"), undefined);
  });

  it("files nothing at all for a department with no types", () => {
    assert.equal(classifyProductType("kitchen-sinks-faucets", "Jaquar Sink Cock"), undefined);
    assert.equal(classifyProductType(undefined, "Jaquar ABS Overhead Shower"), undefined);
  });

  it("ignores case, the way the SQL filter does", () => {
    assert.equal(bathware("JAQUAR ABS OVERHEAD SHOWER"), "showers");
  });
});

describe("productTypeTerms", () => {
  it("excludes every term declared above the one asked for", () => {
    const terms = productTypeTerms("bathware-plumbing", "taps-mixers");
    assert.ok(terms);
    assert.ok(terms.match.includes("mixer"));
    /* Showers, WCs and washbasins are all declared above taps. */
    assert.ok(terms.except.includes("shower"));
    assert.ok(terms.except.includes("cistern"));
  });

  it("gives the first type nothing to exclude", () => {
    const terms = productTypeTerms("bathware-plumbing", "showers");
    assert.ok(terms);
    assert.deepEqual(terms.except, []);
  });

  /* A stale link with a type this department has never defined should
     show the department, not an empty grid and not a 400 — so the
     filter has to come back as "not applicable" rather than as a term
     list that matches nothing. */
  it("returns nothing for a type the department does not define", () => {
    assert.equal(productTypeTerms("bathware-plumbing", "ceiling-fans"), undefined);
    assert.equal(productTypeTerms(undefined, "showers"), undefined);
  });

  /* The filter and the counts have to agree, or a chip reads "25" and
     lands on a grid of 31. They are two implementations of one rule —
     SQL for the filter, JavaScript for the counts — so this checks the
     JavaScript one against the term lists the SQL one is built from. */
  it("agrees with classifyProductType on what belongs where", () => {
    const names = [
      "Jaquar ABS Overhead Shower",
      "Jaquar Wall Mounted Single Lever Basin Mixer",
      "Parryware Cruz C8675 Wall Mounted White Closet WC",
      "Hexa Blade",
    ];

    for (const type of productTypesFor("bathware-plumbing")) {
      const terms = productTypeTerms("bathware-plumbing", type.id);
      if (!terms) throw new Error(`no terms for ${type.id}`);

      for (const name of names) {
        const lower = name.toLowerCase();
        const hit = (term: string) => lower.includes(term.toLowerCase());
        const matchedBySql: boolean = terms.match.some(hit) && !terms.except.some(hit);

        assert.equal(
          matchedBySql,
          classifyProductType("bathware-plumbing", name) === type.id,
          `${name} disagrees on ${type.id}`,
        );
      }
    }
  });
});
