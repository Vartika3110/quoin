import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and src/lib/data/studio.ts pulls in
   `db` (src/lib/db.ts), which pulls in `env`. Same shim as
   tests/projects.test.mts — set before the first import that touches it. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  ROOM_TO_DB,
  ROOM_FROM_DB,
  ROOM_LABEL,
  ROOMS,
  VISIBILITY_TO_DB,
  VISIBILITY_FROM_DB,
  ITEM_KIND_TO_DB,
  ITEM_KIND_FROM_DB,
  SwatchSchema,
  imageUrlFor,
  slugify,
  summariseItems,
} = await import("@/lib/data/studio");

describe("wire ↔ database vocabulary", () => {
  it("round-trips every room, in both directions", () => {
    // The two Records are the only place this mapping is written down.
    // A room added to one and not the other is the bug this catches —
    // it type-checks, because both are exhaustive over their own key
    // type, and then produces a room that saves as something else.
    for (const room of ROOMS) {
      assert.equal(ROOM_FROM_DB[ROOM_TO_DB[room]], room);
    }
    assert.equal(Object.keys(ROOM_TO_DB).length, Object.keys(ROOM_FROM_DB).length);
  });

  it("gives every room a display label", () => {
    // The filter rail, the Space header and the share card all read
    // ROOM_LABEL. A missing one renders as `undefined`, not as a gap.
    for (const room of ROOMS) {
      assert.equal(typeof ROOM_LABEL[room], "string");
      assert.ok(ROOM_LABEL[room].length > 0);
    }
  });

  it("round-trips visibility and item kinds", () => {
    for (const v of ["private", "public"] as const) {
      assert.equal(VISIBILITY_FROM_DB[VISIBILITY_TO_DB[v]], v);
    }
    for (const k of ["idea", "product", "material", "color", "note"] as const) {
      assert.equal(ITEM_KIND_FROM_DB[ITEM_KIND_TO_DB[k]], k);
    }
  });
});

describe("SwatchSchema", () => {
  it("expands three-digit hex so a palette renders identically everywhere", () => {
    const parsed = SwatchSchema.parse({ hex: "#ABC", name: "Sky" });
    assert.equal(parsed.hex, "#aabbcc");
  });

  it("lower-cases six-digit hex", () => {
    assert.equal(SwatchSchema.parse({ hex: "#D9C9B4", name: "Beige" }).hex, "#d9c9b4");
  });

  it("rejects anything that is not a hex colour", () => {
    for (const hex of ["d9c9b4", "#ggg", "#12345", "rgb(1,2,3)", ""]) {
      assert.equal(SwatchSchema.safeParse({ hex, name: "x" }).success, false, hex);
    }
  });

  it("requires a name — an unnamed swatch is a coloured square nobody can discuss", () => {
    assert.equal(SwatchSchema.safeParse({ hex: "#d9c9b4", name: "" }).success, false);
  });
});

describe("imageUrlFor", () => {
  it("serves a shipped asset from its own path", () => {
    assert.equal(
      imageUrlFor({ id: "abc", assetPath: "/catalogue/x.webp", fileId: null }),
      "/catalogue/x.webp",
    );
  });

  it("routes an upload through the signing route, never at a bucket URL", () => {
    // The bucket is private and nothing is served from a public URL
    // there. A signed URL baked into feed JSON would expire inside the
    // cache window and every stale tile would render broken.
    assert.equal(
      imageUrlFor({ id: "abc", assetPath: null, fileId: "file_1" }),
      "/studio/image/abc",
    );
  });
});

describe("slugify", () => {
  it("produces a URL-safe slug with a random suffix", () => {
    const slug = slugify("Modern Warm Kitchen");
    assert.match(slug, /^modern-warm-kitchen-[a-z2-9]{6}$/);
  });

  it("gives two identical titles different URLs", () => {
    // Without the suffix the second upload of "Warm minimal kitchen"
    // either collides or gets renamed to something that tells everyone
    // it was second.
    assert.notEqual(slugify("Warm minimal kitchen"), slugify("Warm minimal kitchen"));
  });

  it("strips diacritics rather than dropping the words carrying them", () => {
    assert.match(slugify("Café Façade"), /^cafe-facade-/);
  });

  it("still produces a usable slug for a title with no latin letters at all", () => {
    const slug = slugify("रसोई");
    assert.match(slug, /^[a-z2-9]{6}$/);
  });

  it("caps the readable part so a pasted paragraph is not the URL", () => {
    const slug = slugify("one two three four five six seven eight nine ten eleven");
    assert.ok(slug.length <= 67, slug);
    assert.ok(!slug.includes("nine"));
  });
});

describe("summariseItems", () => {
  const item = (over: Partial<Parameters<typeof summariseItems>[0][number]>) => ({
    kind: "product" as const,
    qty: 1,
    unitPricePaise: 0,
    ...over,
  });

  it("counts each kind separately", () => {
    const totals = summariseItems([
      item({ kind: "idea" }),
      item({ kind: "idea" }),
      item({ kind: "product", unitPricePaise: 1250000 }),
      item({ kind: "material", qty: 2, unitPricePaise: 50000 }),
      item({ kind: "color" }),
      item({ kind: "note" }),
    ]);

    assert.equal(totals.ideas, 2);
    assert.equal(totals.products, 1);
    assert.equal(totals.materials, 1);
  });

  it("prices products and materials, and nothing else", () => {
    // A colour and a note cost nothing. Summing them in at zero would
    // make "12 items" and "12 priced items" the same number.
    const totals = summariseItems([
      item({ kind: "product", unitPricePaise: 1250000 }),
      item({ kind: "material", qty: 2, unitPricePaise: 50000 }),
      item({ kind: "idea", unitPricePaise: 999999 }),
      item({ kind: "color", unitPricePaise: 999999 }),
      item({ kind: "note", unitPricePaise: 999999 }),
    ]);

    assert.equal(totals.plannedPaise, 1250000 + 100000);
  });

  it("rounds per line, so the total equals the sum of what is on screen", () => {
    // 12.5 × 333 paise is 4162.5 — a fraction of a paisa. Rounding at
    // the end instead accumulates those across every line and produces a
    // total nobody can reconcile against the rows above it.
    const totals = summariseItems([
      item({ kind: "material", qty: 12.5, unitPricePaise: 333 }),
      item({ kind: "material", qty: 12.5, unitPricePaise: 333 }),
    ]);

    assert.equal(totals.plannedPaise, 4163 + 4163);
    assert.equal(Number.isInteger(totals.plannedPaise), true);
  });

  it("is zero for an empty room rather than NaN", () => {
    const totals = summariseItems([]);
    assert.deepEqual(totals, { ideas: 0, products: 0, materials: 0, plannedPaise: 0 });
  });
});

/* ---- The masonry column assignment ---------------------------------------
 *
 * `Masonry` computes this inside a component, so the arithmetic is
 * restated here against the same rules. What is being pinned down is the
 * property the whole grid depends on: appending tiles must never move the
 * ones already placed. That is what makes infinite scroll possible
 * without the page walking out from under someone mid-read.
 */

function assign(ratios: number[], columnCount: number): number[][] {
  const buckets = Array.from({ length: columnCount }, () => ({
    items: [] as number[],
    height: 0,
  }));

  ratios.forEach((ratio, index) => {
    let target = buckets[0];
    for (const bucket of buckets) if (bucket.height < target.height) target = bucket;
    target.items.push(index);
    target.height += Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  });

  return buckets.map((b) => b.items);
}

describe("masonry column assignment", () => {
  it("fills equal tiles left to right, in reading order", () => {
    // Ties go to the leftmost column, which is what `<` rather than `<=`
    // buys: a page of squares reads across, not in a zig-zag.
    assert.deepEqual(assign([1, 1, 1, 1], 4), [[0], [1], [2], [3]]);
  });

  it("puts the next tile in the shortest column", () => {
    // A tall tile first means column 0 stays the tallest, so the next
    // three go elsewhere before anything joins it.
    const columns = assign([3, 1, 1, 1], 2);
    assert.deepEqual(columns[0], [0]);
    assert.deepEqual(columns[1], [1, 2, 3]);
  });

  it("never moves an already-placed tile when a page is appended", () => {
    // The property the feed is built on. Placement depends only on the
    // tiles before it, so page two cannot rearrange page one.
    const first = [1.4, 0.7, 1, 1.2, 0.9, 1.5, 1.1, 0.8];
    const second = [1, 1.3, 0.6, 1.45];

    const before = assign(first, 4);
    const after = assign([...first, ...second], 4);

    for (let column = 0; column < before.length; column++) {
      assert.deepEqual(
        after[column].slice(0, before[column].length),
        before[column],
        `column ${column} was rearranged by the append`,
      );
    }
  });

  it("keeps every tile exactly once", () => {
    const columns = assign([1.4, 0.7, 1, 1.2, 0.9, 1.5, 1.1], 3);
    const placed = columns.flat().sort((a, b) => a - b);
    assert.deepEqual(placed, [0, 1, 2, 3, 4, 5, 6]);
  });

  it("survives a bad ratio rather than dumping the rest into one column", () => {
    // A zero or negative ratio would make a column infinitely attractive
    // and every remaining tile would land in it. Bad dimensions are a
    // data problem, not a reason for a column of four hundred.
    const columns = assign([0, -5, Number.NaN, 1, 1, 1], 3);
    for (const column of columns) {
      assert.ok(column.length <= 2, `one column took ${column.length} of six tiles`);
    }
  });

  it("balances heights to within one tile", () => {
    const ratios = [1.4, 0.7, 1, 1.2, 0.9, 1.5, 1.1, 0.8, 1.3, 0.6, 1.45, 1];
    const columns = assign(ratios, 4);
    const heights = columns.map((column) =>
      column.reduce((sum, index) => sum + ratios[index], 0),
    );
    const spread = Math.max(...heights) - Math.min(...heights);
    assert.ok(spread <= Math.max(...ratios), `columns differ by ${spread}`);
  });
});
