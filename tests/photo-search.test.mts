import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { parseReading, PhotoSearchError } = await import("@/lib/photo-search-openai");

describe("parseReading", () => {
  it("keeps up to four distinct terms, most specific first", () => {
    const r = parseReading(
      JSON.stringify({
        description: "A grey tile floor.",
        terms: ["vitrified floor tile", "Vitrified Floor Tile", "grey tile", "floor tile", "tile", "extra"],
      }),
    );
    assert.deepEqual(r.terms, ["vitrified floor tile", "grey tile", "floor tile", "tile"]);
    assert.equal(r.description, "A grey tile floor.");
  });

  it("drops non-string and blank terms and strips line breaks", () => {
    const r = parseReading(JSON.stringify({ description: "x\ny", terms: [1, "", "  ", "brass\npendant light"] }));
    assert.deepEqual(r.terms, ["brass pendant light"]);
    assert.equal(r.description, "x y");
  });

  it("returns no terms when the photo had nothing to search for", () => {
    assert.deepEqual(parseReading(JSON.stringify({ description: "A face", terms: [] })).terms, []);
  });

  it("refuses a body that is not the agreed shape", () => {
    assert.throws(() => parseReading("not json"), PhotoSearchError);
    /* An array has no `terms`, so it reads as "found nothing" — which the
       route reports as such rather than as a server fault. */
    assert.deepEqual(parseReading("[]").terms, []);
    assert.throws(() => parseReading("null"), PhotoSearchError);
  });
});
