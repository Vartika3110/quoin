/**
 * "Understand the photo" — finding the floor, wall or door in a customer's
 * picture and putting a rough size on it, without a model and without
 * leaving the browser.
 *
 * The method is deliberately plain. Starting from a patch of pixels that
 * is very probably the surface (the strip along the bottom for a floor,
 * the upper middle for a wall, the centre for a door), grow outwards over
 * pixels of a similar colour, stopping at real edges. The grown region is
 * then reduced to four straight edges, which become the quad the
 * visualiser lays the product on. Blobs of "not surface" standing inside
 * the quad — a sofa on the floor — are returned as holes so the product
 * can be drawn behind them.
 *
 * A rough size comes from a pinhole-camera model: a phone's usual field
 * of view, held about 1.4 m off the floor, with the horizon taken from
 * where the floor's side edges converge. It is an estimate and it is
 * labelled as one everywhere it is shown: a photo cannot say how far away
 * a wall is, only how it is shaped. Wall and door sizes lean on the
 * ordinary height of a room and of a door.
 *
 * Pure functions over a small raster, so every number here can be tested
 * in node without a canvas.
 */

import { defaultQuad, type Pt } from "@/lib/visualise/engine";

export type FitKind = "floor" | "wall" | "door";

/** RGBA pixels, row-major — the shape of `ImageData`. */
export interface Raster {
  w: number;
  h: number;
  data: ArrayLike<number>;
}

export interface Holes {
  /** One byte per pixel of the raster the fit was run on: 255 where something stands in front. */
  mask: Uint8Array;
  w: number;
  h: number;
  /** How many separate objects were found. */
  count: number;
}

export interface Fit {
  /** Four corners, normalised, clockwise from top-left. */
  quad: Pt[];
  /** 0–1: how well a four-sided shape describes what was found. */
  confidence: number;
  /** Share of the picture the grown region covers. */
  coverage: number;
  /** Floor: width × depth. Wall and door: width × height. Feet. */
  widthFt: number;
  lengthFt: number;
  holes: Holes | null;
}

export interface FitOptions {
  /** Also look for things standing in front of the surface. */
  holes?: boolean;
  /** Seed from one patch only: for a live camera, where speed matters. */
  fast?: boolean;
  /** Measure this quad instead of the one found (e.g. one the customer dragged). */
  quad?: Pt[];
}

const FT_PER_M = 3.2808;
/** A standard interior door, in feet — the height a door's width is judged against. */
export const STANDARD_DOOR_HEIGHT_FT = 6.9;
const ROOM_HEIGHT_FT = 10;
const CAMERA_HEIGHT_M = 1.4;
/** Focal length as a multiple of the picture's width: about a 66° lens. */
const FOCAL_PER_WIDTH = 0.77;

/** Colour tolerances tried in turn, loosest last. */
const LEVELS = [22, 32, 44, 58, 74] as const;

const SEED_BOXES: Record<FitKind, [number, number, number, number][]> = {
  floor: [[0.12, 0.93, 0.88, 0.99], [0.04, 0.9, 0.4, 0.99], [0.6, 0.9, 0.96, 0.99]],
  wall: [[0.3, 0.2, 0.7, 0.42], [0.08, 0.12, 0.3, 0.4], [0.7, 0.12, 0.92, 0.4], [0.3, 0.04, 0.7, 0.16]],
  door: [[0.44, 0.4, 0.56, 0.62], [0.44, 0.25, 0.56, 0.4]],
};

/** ---- Pixels ------------------------------------------------------------ */

/** The browser's picture, shrunk to a raster small enough to analyse many times a second. */
export function rasterFrom(source: CanvasImageSource, sw: number, sh: number, maxW = 112): Raster {
  const k = Math.min(1, maxW / sw);
  const w = Math.max(16, Math.round(sw * k));
  const h = Math.max(16, Math.round(sh * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

function seedsIn(img: Raster, box: [number, number, number, number]) {
  const { w, h, data: d } = img;
  const x0 = Math.max(0, Math.floor(box[0] * w));
  const x1 = Math.min(w - 1, Math.ceil(box[2] * w));
  const y0 = Math.max(0, Math.floor(box[1] * h));
  const y1 = Math.min(h - 1, Math.ceil(box[3] * h));
  const pts: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pts.push(y * w + x);

  const median = (ch: number) => {
    const a = pts.map((p) => d[p * 4 + ch]).sort((p, q) => p - q);
    return a[a.length >> 1];
  };
  const mean: [number, number, number] = [median(0), median(1), median(2)];
  /* Seeds are the pixels that agree with the patch's median: a lamp or a
     skirting board inside the box does not get to define the surface. */
  const near = pts.filter((p) => {
    const i = p * 4;
    return Math.abs(d[i] - mean[0]) + Math.abs(d[i + 1] - mean[1]) + Math.abs(d[i + 2] - mean[2]) < 60;
  });
  return { seeds: near.length >= 6 ? near : pts, mean };
}

/**
 * Grows a region from the seeds. A pixel joins when it is close to its
 * neighbour *and* to a slowly-moving reference carried along the growth
 * path — which follows a smooth lighting gradient across a floor but
 * will not be carried across a real edge — and is not far from the seed
 * colour overall.
 */
function grow(img: Raster, seeds: number[], mean: [number, number, number], tolRef: number) {
  const { w, h, data: d } = img;
  const n = w * h;
  const mask = new Uint8Array(n);
  const queue = new Int32Array(n);
  const ref = new Float32Array(n * 3);
  const tolStep = tolRef * 0.8;
  const tolSeed = 300;
  let head = 0;
  let tail = 0;
  for (const p of seeds) {
    if (mask[p]) continue;
    mask[p] = 1;
    queue[tail++] = p;
    ref[p * 3] = d[p * 4];
    ref[p * 3 + 1] = d[p * 4 + 1];
    ref[p * 3 + 2] = d[p * 4 + 2];
  }
  const step = [1, -1, w, -w];
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const i = p * 4;
    for (let k = 0; k < 4; k++) {
      if (k === 0 && x === w - 1) continue;
      if (k === 1 && x === 0) continue;
      const np = p + step[k];
      if (np < 0 || np >= n || mask[np]) continue;
      const j = np * 4;
      const r = d[j];
      const g = d[j + 1];
      const b = d[j + 2];
      if (Math.abs(r - d[i]) + Math.abs(g - d[i + 1]) + Math.abs(b - d[i + 2]) > tolStep) continue;
      if (Math.abs(r - ref[p * 3]) + Math.abs(g - ref[p * 3 + 1]) + Math.abs(b - ref[p * 3 + 2]) > tolRef) continue;
      if (Math.abs(r - mean[0]) + Math.abs(g - mean[1]) + Math.abs(b - mean[2]) > tolSeed) continue;
      mask[np] = 1;
      queue[tail++] = np;
      ref[np * 3] = ref[p * 3] * 0.88 + r * 0.12;
      ref[np * 3 + 1] = ref[p * 3 + 1] * 0.88 + g * 0.12;
      ref[np * 3 + 2] = ref[p * 3 + 2] * 0.88 + b * 0.12;
    }
  }
  return { mask, count: tail };
}

/** Drops one-pixel leaks: erode, then grow back. */
function open(mask: Uint8Array, w: number, h: number): Uint8Array {
  const eroded = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (mask[p] && mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) eroded[p] = 1;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (
        eroded[p] ||
        (x > 0 && eroded[p - 1]) ||
        (x < w - 1 && eroded[p + 1]) ||
        (y > 0 && eroded[p - w]) ||
        (y < h - 1 && eroded[p + w])
      ) {
        out[p] = 1;
      }
    }
  }
  /* The erode skipped the picture's own border; keep what was there. */
  for (let x = 0; x < w; x++) {
    if (mask[x] && out[x + w]) out[x] = 1;
    if (mask[(h - 1) * w + x] && out[(h - 2) * w + x]) out[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    if (mask[y * w] && out[y * w + 1]) out[y * w] = 1;
    if (mask[y * w + w - 1] && out[y * w + w - 2]) out[y * w + w - 1] = 1;
  }
  return out;
}

/** ---- Lines and the quad ------------------------------------------------ */

interface Line {
  a: number;
  b: number;
}

/** Least squares `v = a + b·t`, refitted after dropping the worst quarter. */
function fitLine(pts: [number, number][]): Line | null {
  const lin = (P: [number, number][]): Line => {
    const n = P.length;
    let st = 0;
    let sv = 0;
    let stt = 0;
    let stv = 0;
    for (const [t, v] of P) {
      st += t;
      sv += v;
      stt += t * t;
      stv += t * v;
    }
    const den = n * stt - st * st;
    const b = Math.abs(den) < 1e-9 ? 0 : (n * stv - st * sv) / den;
    return { a: (sv - b * st) / n, b };
  };
  if (!pts.length) return null;
  if (pts.length < 3) return { a: pts[0][1], b: 0 };
  const f = lin(pts);
  const ranked = pts
    .map(([t, v]) => [Math.abs(v - f.a - f.b * t), t, v] as const)
    .sort((p, q) => p[0] - q[0]);
  return lin(ranked.slice(0, Math.max(3, Math.ceil(ranked.length * 0.75))).map(([, t, v]) => [t, v]));
}

function quadOf(mask: Uint8Array, w: number, h: number): Pt[] | null {
  const rowMin = Math.max(2, Math.round(w * 0.04));
  const colMin = Math.max(2, Math.round(h * 0.04));
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  const T: [number, number][] = [];
  const B: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    let x0 = -1;
    let x1 = -1;
    let c = 0;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x0 < 0) x0 = x;
        x1 = x;
        c++;
      }
    }
    if (c >= rowMin) {
      L.push([y, x0]);
      R.push([y, x1 + 1]);
    }
  }
  for (let x = 0; x < w; x++) {
    let y0 = -1;
    let y1 = -1;
    let c = 0;
    for (let y = 0; y < h; y++) {
      if (mask[y * w + x]) {
        if (y0 < 0) y0 = y;
        y1 = y;
        c++;
      }
    }
    if (c >= colMin) {
      T.push([x, y0]);
      B.push([x, y1 + 1]);
    }
  }
  if (L.length < 4 || T.length < 4) return null;

  /* A boundary point sitting on the picture's own edge says nothing about
     where the surface ends — the floor simply carries on out of frame — so
     it is left out of the line fit. */
  const inner = (P: [number, number][], limit: number, flip: boolean) =>
    P.filter(([, v]) => (flip ? limit - v : v) > 0.5 && (flip ? limit - v : v) < limit - 0.5);
  const Lk = inner(L, w, false);
  const Rk = inner(R, w, true);
  const Tk = inner(T, h, false);
  const Bk = inner(B, h, true);
  const fl = (Lk.length >= 6 && fitLine(Lk)) || { a: 0, b: 0 };
  const fr = (Rk.length >= 6 && fitLine(Rk)) || { a: w, b: 0 };
  const ft = (Tk.length >= 6 && fitLine(Tk)) || { a: 0, b: 0 };
  const fb = (Bk.length >= 6 && fitLine(Bk)) || { a: h, b: 0 };

  /* Side edges are x = a + b·y, top and bottom are y = c + d·x. */
  const hit = (v: Line, z: Line): Pt | null => {
    const den = 1 - v.b * z.b;
    if (Math.abs(den) < 1e-6) return null;
    const x = (v.a + v.b * z.a) / den;
    return [x, z.a + z.b * x];
  };
  const q = [hit(fl, ft), hit(fr, ft), hit(fr, fb), hit(fl, fb)];
  if (q.some((p) => !p)) return null;
  const clamp = (v: number) => Math.max(-0.1, Math.min(1.1, v));
  return (q as Pt[]).map((p): Pt => [clamp(p[0] / w), clamp(p[1] / h)]);
}

export function quadArea(q: Pt[]): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** Corners in the right order, and big enough to be a surface. */
export function quadIsValid(q: Pt[]): boolean {
  return q[0][0] < q[1][0] && q[3][0] < q[2][0] && q[0][1] < q[3][1] && q[1][1] < q[2][1] && quadArea(q) > 0.03;
}

function inside(q: Pt[], x: number, y: number): boolean {
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c > 0) pos++;
    else if (c < 0) neg++;
  }
  return pos === 0 || neg === 0;
}

/** ---- Things in front of the surface ------------------------------------ */

/**
 * Large blobs of "not the surface" inside the quad. A blob has to be big
 * and chunky: the thin slivers left along a fitted edge are measurement
 * error, not furniture.
 */
function findHoles(mask: Uint8Array, w: number, h: number, quadNorm: Pt[]): Holes {
  const q = quadNorm.map((p): Pt => [p[0] * w, p[1] * h]);
  const hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (!mask[y * w + x] && inside(q, x + 0.5, y + 0.5)) hole[y * w + x] = 1;
  }
  const out = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const minSize = 0.004 * w * h;
  const minSide = Math.max(5, 0.05 * Math.min(w, h));
  const stack: number[] = [];
  let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (!hole[s] || seen[s]) continue;
    const comp: number[] = [];
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      comp.push(p);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const [ok, np] of [
        [x > 0, p - 1],
        [x < w - 1, p + 1],
        [y > 0, p - w],
        [y < h - 1, p + w],
      ] as const) {
        if (ok && hole[np] && !seen[np]) {
          seen[np] = 1;
          stack.push(np);
        }
      }
    }
    if (comp.length >= minSize && Math.min(x1 - x0 + 1, y1 - y0 + 1) >= minSide) {
      count++;
      for (const p of comp) out[p] = 255;
    }
  }
  return { mask: out, w, h, count };
}

/** ---- Size -------------------------------------------------------------- */

/**
 * A rough real-world size for a quad. Floor: the visible floor's width and
 * depth. Wall: width and height. Door: width and height.
 */
export function estimateSize(kind: FitKind, quad: Pt[], pw: number, ph: number): { widthFt: number; lengthFt: number } {
  const px = quad.map((p): Pt => [p[0] * pw, p[1] * ph]);
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  if (kind === "floor") {
    const f = FOCAL_PER_WIDTH * pw;
    const yt = (px[0][1] + px[1][1]) / 2;
    const yb = (px[2][1] + px[3][1]) / 2;
    /* The horizon is where the floor's two side edges would meet. */
    let yh: number | null = null;
    const dl = [px[3][0] - px[0][0], px[3][1] - px[0][1]];
    const dr = [px[2][0] - px[1][0], px[2][1] - px[1][1]];
    const den = dl[0] * dr[1] - dl[1] * dr[0];
    if (Math.abs(den) > 1e-6) {
      const t = ((px[1][0] - px[0][0]) * dr[1] - (px[1][1] - px[0][1]) * dr[0]) / den;
      const vy = px[0][1] + t * dl[1];
      if (Number.isFinite(vy) && vy < yt - 0.03 * ph && vy > -1.5 * ph) yh = vy;
    }
    if (yh === null) yh = Math.min(0.5 * ph, yt - 0.06 * ph);
    const z = (y: number) => (CAMERA_HEIGHT_M * f) / Math.max(0.02 * ph, y - yh!);
    const zFar = z(yt);
    const zNear = z(Math.max(yb, yt + 0.05 * ph));
    const depth = Math.max(0.5, zFar - zNear);
    const width = (Math.abs(px[1][0] - px[0][0]) / f) * zFar;
    return { widthFt: Math.round(clamp(width * FT_PER_M, 4, 30)), lengthFt: Math.round(clamp(depth * FT_PER_M, 4, 30)) };
  }

  const vertical = (dist(px[0], px[3]) + dist(px[1], px[2])) / 2;
  const horizontal = (dist(px[0], px[1]) + dist(px[3], px[2])) / 2;
  if (kind === "wall") {
    /* A wall that fills most of the picture is taken as floor-to-ceiling. */
    const height = ROOM_HEIGHT_FT * Math.min(1, vertical / ph / 0.78);
    return {
      widthFt: Math.round(clamp((height * horizontal) / Math.max(1, vertical), 4, 30)),
      lengthFt: Math.round(clamp(height, 4, 30)),
    };
  }
  return {
    widthFt: Math.round(clamp((STANDARD_DOOR_HEIGHT_FT * horizontal) / Math.max(1, vertical), 2.2, 5) * 10) / 10,
    lengthFt: STANDARD_DOOR_HEIGHT_FT,
  };
}

/** ---- The fit ----------------------------------------------------------- */

interface Candidate {
  quad: Pt[];
  confidence: number;
  coverage: number;
  mask: Uint8Array;
  score: number;
}

function tryBox(img: Raster, kind: FitKind, box: [number, number, number, number]): Candidate {
  const { w, h } = img;
  const { seeds, mean } = seedsIn(img, box);
  const minCover = kind === "floor" ? 0.12 : kind === "wall" ? 0.14 : 0.03;
  const maxCover = kind === "door" ? 0.4 : 0.8;
  const grown = LEVELS.map((tol) => {
    const g = grow(img, seeds, mean, tol);
    return { ...g, cover: g.count / (w * h) };
  });

  /* Take the first plateau — a tolerance step that barely grows the
     region. That is the surface itself, before it starts leaking into
     furniture or the next wall. */
  let pick = -1;
  for (let i = 0; i < grown.length; i++) {
    if (grown[i].cover < minCover || grown[i].cover > maxCover) continue;
    /* A sudden jump after a usable region is a leak into the next surface. */
    if (pick >= 0 && grown[i].cover > grown[pick].cover * 1.7 && grown[i].cover > 0.32) break;
    if (pick < 0) pick = i;
    const next = grown[i + 1];
    if (next && next.cover / grown[i].cover <= 1.04) {
      pick = i + 1;
      break;
    }
  }
  const low = pick < 0;
  if (low) pick = grown.some((g) => g.cover > maxCover) ? 0 : grown.length - 1;
  const best = grown[pick];

  const mask = open(best.mask, w, h);
  let quad = quadOf(mask, w, h);
  if (!quad || !quadIsValid(quad)) {
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    quad = x1 > x0 && y1 > y0
      ? [[x0 / w, y0 / h], [(x1 + 1) / w, y0 / h], [(x1 + 1) / w, (y1 + 1) / h], [x0 / w, (y1 + 1) / h]]
      : null;
  }

  let fill = 0;
  if (!quad || !quadIsValid(quad)) {
    quad = defaultQuad(kind);
  } else {
    const qp = quad.map((p): Pt => [p[0] * w, p[1] * h]);
    let inQ = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (mask[y * w + x] && inside(qp, x + 0.5, y + 0.5)) inQ++;
    }
    fill = Math.min(1, inQ / Math.max(1, quadArea(quad) * w * h));
  }
  const confidence = Math.max(0, Math.min(1, (low ? 0.15 : 0.25) + 0.75 * fill - (best.cover > maxCover ? 0.2 : 0)));
  return { quad, confidence, coverage: best.cover, mask, score: low ? 0 : best.cover * (0.4 + confidence) };
}

/**
 * Finds the surface and sizes it. Several starting patches are tried and
 * the one that yields the biggest, best-fitting region wins, so a window
 * or a picture in the middle of a wall does not decide the answer.
 */
export function fitSurface(img: Raster, kind: FitKind, opts: FitOptions = {}): Fit {
  const boxes = SEED_BOXES[kind].slice(0, opts.fast ? 1 : SEED_BOXES[kind].length);
  let best: Candidate | null = null;
  for (const box of boxes) {
    const c = tryBox(img, kind, box);
    if (!best || c.score > best.score) best = c;
  }
  const chosen = best!;
  const measured = opts.quad ?? chosen.quad;
  const size = estimateSize(kind, measured, img.w, img.h);
  return {
    quad: chosen.quad,
    confidence: chosen.confidence,
    coverage: chosen.coverage,
    widthFt: size.widthFt,
    lengthFt: size.lengthFt,
    holes: opts.holes ? findHoles(chosen.mask, img.w, img.h, measured) : null,
  };
}

/**
 * A detected door is its leaf; the product photograph also has a frame,
 * so the quad is grown a little to take it in.
 */
export function padDoorQuad(q: Pt[]): Pt[] {
  const pu = 0.07;
  const pt = 0.025;
  const at = (u: number, v: number): Pt => [0, 1].map(
    (a) => (1 - v) * ((1 - u) * q[0][a] + u * q[1][a]) + v * ((1 - u) * q[3][a] + u * q[2][a]),
  ) as Pt;
  return [at(-pu, -pt), at(1 + pu, -pt), at(1 + pu, 1), at(-pu, 1)];
}

export type Confidence = "good" | "check" | "low";

export function confidenceLabel(c: number): Confidence {
  return c >= 0.72 ? "good" : c >= 0.5 ? "check" : "low";
}

/** How a door of a given size sits in an opening, in words. */
export function doorFitNote(opening: { widthFt: number; heightFt: number }, door: { widthFt: number; heightFt: number }): { fits: boolean; text: string } {
  const dw = opening.widthFt - door.widthFt;
  const dh = opening.heightFt - door.heightFt;
  const o = `${opening.widthFt.toFixed(1)} × ${opening.heightFt.toFixed(1)} ft`;
  const d = `${door.widthFt} × ${door.heightFt} ft`;
  if (Math.abs(dw) <= 0.2 && Math.abs(dh) <= 0.3) {
    return { fits: true, text: `Looks like a fit: the opening is about ${o} and this door is ${d}.` };
  }
  const bits: string[] = [];
  if (dw > 0.2) bits.push("the opening is wider than the door");
  else if (dw < -0.2) bits.push("the door is wider than the opening");
  if (dh > 0.3) bits.push("the opening is taller");
  else if (dh < -0.3) bits.push("the door is taller than the opening");
  return { fits: false, text: `Opening about ${o} against a door of ${d}: ${bits.join(" and ")}. Measure on site before ordering.` };
}
