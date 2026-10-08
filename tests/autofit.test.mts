import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { fitSurface, estimateSize, padDoorQuad, quadIsValid, quadArea, doorFitNote, confidenceLabel } = await import("@/lib/visualise/autofit");

type Poly = [number, number][];
type Paint = (x: number, y: number) => [number, number, number];

/** A tiny synthetic room: shapes painted back to front, in unit coordinates. */
function room(w: number, h: number, shapes: { poly: Poly; paint: Paint }[]) {
  const data = new Uint8ClampedArray(w * h * 4);
  const hit = (poly: Poly, x: number, y: number) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5) / w;
      const y = (py + 0.5) / h;
      let rgb: [number, number, number] = [0, 0, 0];
      for (const s of shapes) if (hit(s.poly, x, y)) rgb = s.paint(x, y);
      const i = (py * w + px) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  return { w, h, data };
}
const flat = (r: number, g: number, b: number): Paint => () => [r, g, b];
const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Back wall, side walls, a floor lit from the window (darker nearer the camera), and a sofa on it. */
const livingRoom = () =>
  room(112, 80, [
    { poly: rect(0, 0, 1, 1), paint: flat(205, 196, 178) },
    { poly: rect(0.2, 0, 0.8, 0.5625), paint: flat(236, 229, 216) },
    { poly: [[0, 0], [0.2, 0.5625], [0, 0.8]], paint: flat(214, 205, 188) },
    { poly: [[1, 0], [0.8, 0.5625], [1, 0.8]], paint: flat(206, 197, 180) },
    { poly: [[0.2, 0.5625], [0.8, 0.5625], [1, 0.8], [1, 1], [0, 1], [0, 0.8]], paint: (_x, y) => [190 - (y - 0.56) * 120, 175 - (y - 0.56) * 120, 150 - (y - 0.56) * 110] },
    { poly: rect(0.28, 0.64, 0.72, 0.9), paint: flat(104, 128, 120) },
  ]);

describe("fitSurface — floor", () => {
  const fit = fitSurface(livingRoom(), "floor", { holes: true });

  it("finds the floor's far edge and its sides", () => {
    const [tl, tr, br, bl] = fit.quad;
    assert.ok(Math.abs(tl[1] - 0.5625) < 0.06, `far edge at ${tl[1]}`);
    assert.ok(Math.abs(tr[1] - 0.5625) < 0.06);
    assert.ok(Math.abs(tl[0] - 0.2) < 0.08, `far-left at ${tl[0]}`);
    assert.ok(Math.abs(tr[0] - 0.8) < 0.08, `far-right at ${tr[0]}`);
    assert.ok(br[1] > 0.95 && bl[1] > 0.95, "runs to the bottom of the picture");
    assert.ok(bl[0] < tl[0] && br[0] > tr[0], "widens towards the camera");
    assert.ok(quadIsValid(fit.quad));
  });

  it("sees the sofa standing on it and leaves it out", () => {
    assert.ok(fit.holes && fit.holes.count >= 1);
    const m = fit.holes!;
    const at = (x: number, y: number) => m.mask[Math.floor(y * m.h) * m.w + Math.floor(x * m.w)];
    assert.equal(at(0.5, 0.78), 255, "sofa is a hole");
    assert.equal(at(0.5, 0.97), 0, "bare floor is not");
  });

  it("is reasonably sure, and gives a size inside the believable range", () => {
    assert.ok(fit.confidence > 0.6, `confidence ${fit.confidence}`);
    assert.ok(fit.widthFt >= 4 && fit.widthFt <= 30);
    assert.ok(fit.lengthFt >= 4 && fit.lengthFt <= 30);
  });
});

describe("fitSurface — wall", () => {
  it("finds the back wall above the floor, not the whole room", () => {
    const scene = room(112, 80, [
      { poly: rect(0, 0, 1, 1), paint: flat(120, 100, 80) },
      { poly: rect(0, 0, 1, 0.6), paint: flat(230, 222, 205) },
      { poly: rect(0.4, 0.15, 0.6, 0.35), paint: flat(150, 190, 220) },
    ]);
    const fit = fitSurface(scene, "wall");
    const [tl, , br] = fit.quad;
    assert.ok(tl[1] < 0.05, `top ${tl[1]}`);
    assert.ok(Math.abs(br[1] - 0.6) < 0.06, `bottom ${br[1]}`);
    assert.ok(fit.confidence > 0.6);
  });
});

describe("fitSurface — door", () => {
  const scene = room(112, 80, [
    { poly: rect(0, 0, 1, 1), paint: flat(228, 218, 196) },
    { poly: rect(0.4, 0.14, 0.6, 0.74), paint: flat(150, 100, 62) },
  ]);
  const fit = fitSurface(scene, "door");

  it("finds the leaf", () => {
    const [tl, tr, br] = fit.quad;
    assert.ok(Math.abs(tl[0] - 0.4) < 0.04 && Math.abs(tr[0] - 0.6) < 0.04);
    assert.ok(Math.abs(tl[1] - 0.14) < 0.05 && Math.abs(br[1] - 0.74) < 0.05);
  });

  it("sizes the width against a standard door height", () => {
    assert.equal(fit.lengthFt, 6.9);
    /* 0.2 × 112 = 22px wide against 0.6 × 80 = 48px tall. */
    assert.ok(Math.abs(fit.widthFt - 6.9 * (22.4 / 48)) < 0.5, `width ${fit.widthFt}`);
  });

  it("grows the quad to take in a frame", () => {
    const padded = padDoorQuad(fit.quad);
    assert.ok(padded[0][0] < fit.quad[0][0] && padded[1][0] > fit.quad[1][0]);
    assert.ok(padded[0][1] < fit.quad[0][1]);
    assert.equal(padded[2][1], fit.quad[2][1]);
  });
});

describe("estimateSize", () => {
  it("reads a deeper room when the far wall is further up the picture, horizon fixed", () => {
    /* Side edges that all run to one vanishing point at (50, 20) in a 100 × 75 picture. */
    const floor = (yt: number): [number, number][] => {
      const k = 1.2;
      const xl = (y: number) => (50 - k * (y - 20)) / 100;
      const xr = (y: number) => (50 + k * (y - 20)) / 100;
      return [[xl(yt), yt / 75], [xr(yt), yt / 75], [xr(75), 1], [xl(75), 1]];
    };
    const near = estimateSize("floor", floor(48), 100, 75);
    const far = estimateSize("floor", floor(34), 100, 75);
    assert.ok(far.lengthFt > near.lengthFt, `${far.lengthFt} vs ${near.lengthFt}`);
  });
  it("assumes a ten-foot room for a wall that fills the picture", () => {
    const s = estimateSize("wall", [[0, 0], [1, 0], [1, 0.8], [0, 0.8]], 160, 90);
    assert.equal(s.lengthFt, 10);
  });
  it("never answers outside the sliders' range", () => {
    const s = estimateSize("floor", [[0.4, 0.99], [0.6, 0.99], [0.7, 1], [0.3, 1]], 100, 75);
    assert.ok(s.widthFt >= 4 && s.lengthFt >= 4 && s.widthFt <= 30 && s.lengthFt <= 30);
  });
});

describe("helpers", () => {
  it("measures and validates quads", () => {
    assert.equal(quadArea([[0, 0], [1, 0], [1, 1], [0, 1]]), 1);
    assert.equal(quadIsValid([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]), true);
    assert.equal(quadIsValid([[0.8, 0.2], [0.2, 0.2], [0.2, 0.8], [0.8, 0.8]]), false);
    assert.equal(quadIsValid([[0.5, 0.5], [0.52, 0.5], [0.52, 0.52], [0.5, 0.52]]), false);
  });
  it("labels confidence", () => {
    assert.equal(confidenceLabel(0.9), "good");
    assert.equal(confidenceLabel(0.6), "check");
    assert.equal(confidenceLabel(0.2), "low");
  });
  it("says whether a door fits its opening, and why not", () => {
    assert.equal(doorFitNote({ widthFt: 3.1, heightFt: 6.9 }, { widthFt: 3, heightFt: 7 }).fits, true);
    const no = doorFitNote({ widthFt: 3.6, heightFt: 6.9 }, { widthFt: 3, heightFt: 7 });
    assert.equal(no.fits, false);
    assert.match(no.text, /wider than the door/);
    assert.match(no.text, /Measure on site/);
  });
});
