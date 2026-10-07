import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { visualiserKindFor, tileSizeFromTitle, isOwnPhoto, sameOriginSrc } = await import("@/lib/visualise/kind");
const { squareToQuad, affineFrom, hitCorner, defaultQuad } = await import("@/lib/visualise/engine");

const base = { fulfilment: "scheduled", hasUsablePhoto: true };

describe("visualiserKindFor", () => {
  it("offers surfaces for tiles and laminates, and paint for emulsions", () => {
    assert.equal(visualiserKindFor({ ...base, title: "Vitrified Floor Tile 600 x 1200 mm", categorySlug: "tiling-adhesives" }), "tile");
    assert.equal(visualiserKindFor({ ...base, title: "Teak Laminate 1mm", categorySlug: "plywood-laminates" }), "tile");
    assert.equal(visualiserKindFor({ ...base, title: "Royale Luxury Emulsion 10L", categorySlug: "paints-finishes" }), "paint");
  });

  it("does not paint a primer, putty or waterproofing, or tile an adhesive", () => {
    assert.equal(visualiserKindFor({ ...base, title: "Wall Primer 20L", categorySlug: "paints-finishes" }), null);
    assert.equal(visualiserKindFor({ ...base, title: "Wall Putty 40kg", categorySlug: "paints-finishes" }), null);
    assert.equal(visualiserKindFor({ ...base, title: "Tile Adhesive 20kg", categorySlug: "tiling-adhesives" }), null);
    assert.equal(visualiserKindFor({ ...base, title: "Plywood 18mm BWP", categorySlug: "plywood-laminates" }), null);
  });

  it("leaves out services, materials that vanish into a wall, and products with no usable photo", () => {
    assert.equal(visualiserKindFor({ ...base, fulfilment: "bookable", title: "Wiring visit", categorySlug: "services" }), null);
    assert.equal(visualiserKindFor({ ...base, title: "OPC 53 Cement 50kg", categorySlug: "cement-steel" }), null);
    assert.equal(visualiserKindFor({ ...base, title: "CPVC Pipe 1 inch", categorySlug: "bathware-plumbing" }), null);
    assert.equal(visualiserKindFor({ ...base, hasUsablePhoto: false, title: "Pendant light", categorySlug: "lighting" }), null);
  });

  it("places everything else as an object", () => {
    assert.equal(visualiserKindFor({ ...base, title: "Concealed Cistern", categorySlug: "bathware-plumbing" }), "object");
    assert.equal(visualiserKindFor({ ...base, title: "Brass Pendant Light", categorySlug: "lighting" }), "object");
  });
});

describe("tileSizeFromTitle", () => {
  it("reads mm and cm sizes", () => {
    assert.deepEqual(tileSizeFromTitle("Floor tile 600 x 1200 mm"), [600, 1200]);
    assert.deepEqual(tileSizeFromTitle("Wall tile 30x60 cm"), [300, 600]);
  });
  it("ignores numbers that are not a tile size", () => {
    assert.equal(tileSizeFromTitle("Pipe 2x3"), null);
    assert.equal(tileSizeFromTitle("Hinge"), null);
  });
});

describe("photo sources", () => {
  it("only draws Quoin's own pictures, and serves bucket ones from this origin", () => {
    assert.equal(isOwnPhoto("/catalogue/a.webp"), true);
    assert.equal(isOwnPhoto("https://x.supabase.co/storage/v1/object/public/p/a.webp"), true);
    assert.equal(isOwnPhoto("https://cdn.competitor.com/a.jpg"), false);
    assert.equal(isOwnPhoto(undefined), false);
    assert.equal(sameOriginSrc("/catalogue/a.webp"), "/catalogue/a.webp");
    assert.match(sameOriginSrc("https://x.supabase.co/storage/v1/object/public/p/a.webp"), /^\/_next\/image\?url=/);
  });
});

describe("perspective maths", () => {
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);

  it("maps the unit square's corners onto the quad's corners", () => {
    const q: [number, number][] = [[10, 20], [200, 30], [180, 150], [5, 140]];
    const H = squareToQuad(q);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
      const [x, y] = H(u, v);
      close(x, q[i][0]);
      close(y, q[i][1]);
    });
  });

  it("handles a parallelogram, where the projective terms vanish", () => {
    const H = squareToQuad([[0, 0], [100, 0], [100, 50], [0, 50]]);
    const [x, y] = H(0.5, 0.5);
    close(x, 50);
    close(y, 25);
  });

  it("builds an affine map for a triangle, and refuses a degenerate one", () => {
    const m = affineFrom([[0, 0], [1, 0], [0, 1]], [[10, 10], [12, 10], [10, 13]])!;
    assert.deepEqual(m.map((n) => Math.round(n * 1e6) / 1e6), [2, 0, 0, 3, 10, 10]);
    assert.equal(affineFrom([[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 0], [0, 1]]), null);
  });

  it("finds the nearest corner within reach", () => {
    const q = defaultQuad("floor");
    assert.equal(hitCorner(q, 0.21, 0.58, 0.07), 0);
    assert.equal(hitCorner(q, 0.5, 0.2, 0.07), -1);
  });
});
