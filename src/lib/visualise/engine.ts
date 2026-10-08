/**
 * The canvas maths behind "See it in your space".
 *
 * Pure functions over `CanvasRenderingContext2D`, no React and no network,
 * so the geometry can be tested without a browser and the component stays
 * about interaction rather than arithmetic.
 *
 * Two jobs:
 *
 *  - **Surfaces** (floors, walls). The customer fits a four-cornered shape
 *    over a surface in their own photograph. A texture — a tile, a
 *    laminate, a paint colour — is laid inside it with real perspective
 *    (a homography, drawn as a mesh of small affine triangles because 2D
 *    canvas has no perspective transform), at the product's true size, so
 *    a 600×1200 mm tile comes out the right proportions for the room. The
 *    photograph's own light and shadow is blended back over the result.
 *  - **Objects** (lights, fittings, furniture, decor). The product
 *    photograph, with its plain background knocked out, is placed at a
 *    real-world width.
 *
 * None of this is a rendering of the product. It is a quick, honest
 * mock-up on the customer's own photograph, and the page says so.
 */

export type Pt = [number, number];

/** Everything about a surface placement, in the units a customer thinks in. */
export interface SurfaceScene {
  /** Four corners, normalised 0–1, clockwise from top-left. */
  quad: Pt[];
  /** Width and depth of the area, in feet. */
  areaWidthFt: number;
  areaDepthFt: number;
  /** One tile's size in millimetres. Ignored for paint. */
  tileMm: [number, number];
  /** Lay tiles at 45°. */
  diagonal: boolean;
}

export interface ObjectScene {
  /** Centre, normalised 0–1. */
  x: number;
  y: number;
  /** Real-world width of the object, in centimetres. */
  widthCm: number;
  /** Degrees. */
  rotation: number;
  /** How wide the photograph is, in centimetres — the scale of the room. */
  roomWidthCm: number;
}

const MM_PER_FT = 304.8;

/** ---- Perspective ------------------------------------------------------- */

/**
 * Maps the unit square onto a quadrilateral. Returns `(u, v) → [x, y]`.
 *
 * The standard square-to-quad projective map (Heckbert). The degenerate
 * case — a parallelogram — is an affine map and is handled separately,
 * because the general form divides by a determinant that is zero there.
 */
export function squareToQuad(q: Pt[]): (u: number, v: number) => Pt {
  const [p0, p1, p2, p3] = q;
  const sx = p0[0] - p1[0] + p2[0] - p3[0];
  const sy = p0[1] - p1[1] + p2[1] - p3[1];

  let a: number, b: number, c: number, d: number, e: number, f: number;
  let g = 0;
  let h = 0;

  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = p1[0] - p0[0];
    b = p3[0] - p0[0];
    c = p0[0];
    d = p1[1] - p0[1];
    e = p3[1] - p0[1];
    f = p0[1];
  } else {
    const dx1 = p1[0] - p2[0];
    const dx2 = p3[0] - p2[0];
    const dy1 = p1[1] - p2[1];
    const dy2 = p3[1] - p2[1];
    const det = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (sx * dy2 - dx2 * sy) / det;
    h = (dx1 * sy - sx * dy1) / det;
    a = p1[0] - p0[0] + g * p1[0];
    b = p3[0] - p0[0] + h * p3[0];
    c = p0[0];
    d = p1[1] - p0[1] + g * p1[1];
    e = p3[1] - p0[1] + h * p3[1];
    f = p0[1];
  }

  return (u, v) => {
    const w = g * u + h * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
}

/** The affine transform taking triangle `s` onto triangle `d`, as the six
    numbers `ctx.transform` wants — or null for a degenerate triangle. */
export function affineFrom(
  s: [Pt, Pt, Pt],
  d: [Pt, Pt, Pt],
): [number, number, number, number, number, number] | null {
  const [x0, y0] = s[0];
  const [x1, y1] = s[1];
  const [x2, y2] = s[2];
  const det = x0 * (y1 - y2) - y0 * (x1 - x2) + (x1 * y2 - x2 * y1);
  if (Math.abs(det) < 1e-9) return null;

  const solve = (u0: number, u1: number, u2: number): [number, number, number] => [
    (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / det,
    (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / det,
    (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / det,
  ];
  const [a, c, e] = solve(d[0][0], d[1][0], d[2][0]);
  const [b, dd, f] = solve(d[0][1], d[1][1], d[2][1]);
  return [a, b, c, dd, e, f];
}

type Source = CanvasImageSource & { width: number; height: number };

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  s: [Pt, Pt, Pt],
  d: [Pt, Pt, Pt],
) {
  const m = affineFrom(s, d);
  if (!m) return;
  const cx = (d[0][0] + d[1][0] + d[2][0]) / 3;
  const cy = (d[0][1] + d[1][1] + d[2][1]) / 3;

  ctx.save();
  /* Clipped to the triangle grown by 6%: antialiasing at a shared edge
     otherwise leaves a hairline of the photograph showing between two
     neighbouring triangles. */
  ctx.beginPath();
  d.forEach((p, i) => {
    const x = cx + (p[0] - cx) * 1.06;
    const y = cy + (p[1] - cy) * 1.06;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/** Draws `image` (size `pw`×`ph`) into `quadPx` as an `n`×`n` mesh. */
export function drawWarped(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  quadPx: Pt[],
  pw: number,
  ph: number,
  n: number,
) {
  const H = squareToQuad(quadPx);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const v0 = j / n;
      const v1 = (j + 1) / n;
      const A = H(u0, v0);
      const B = H(u1, v0);
      const C = H(u1, v1);
      const D = H(u0, v1);
      const sA: Pt = [u0 * pw, v0 * ph];
      const sB: Pt = [u1 * pw, v0 * ph];
      const sC: Pt = [u1 * pw, v1 * ph];
      const sD: Pt = [u0 * pw, v1 * ph];
      drawTriangle(ctx, image, [sA, sB, sC], [A, B, C]);
      drawTriangle(ctx, image, [sA, sC, sD], [A, C, D]);
    }
  }
}

/** ---- Texture ----------------------------------------------------------- */

/**
 * Tiles one swatch across a flat plan of the area, at true scale.
 *
 * The result is the floor *as seen from above*; `drawWarped` then bends it
 * into the customer's perspective. Cell size is `pw × tileMm / areaMm`, so
 * halving the tile size doubles the number of tiles — which is the whole
 * point of the size picker.
 */
export function buildPlan(
  swatch: Source,
  tileMm: [number, number],
  areaWidthMm: number,
  areaDepthMm: number,
  diagonal: boolean,
): HTMLCanvasElement {
  const pw = 1024;
  const ph = Math.max(256, Math.min(2048, Math.round((1024 * areaDepthMm) / areaWidthMm)));
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const cx = canvas.getContext("2d")!;

  /* A floor of tiles has grout; this is what shows in the gaps the
     overdraw below does not close, and on an image that failed to load. */
  cx.fillStyle = "#cfc8bb";
  cx.fillRect(0, 0, pw, ph);

  const cellW = Math.max(18, (pw * tileMm[0]) / areaWidthMm);
  const cellH = Math.max(18, (cellW * tileMm[1]) / tileMm[0]);

  cx.save();
  let extent = 0;
  if (diagonal) {
    cx.translate(pw / 2, ph / 2);
    cx.rotate(Math.PI / 4);
    cx.translate(-pw / 2, -ph / 2);
    extent = Math.hypot(pw, ph) * 0.5;
  }
  for (let y = -extent; y < ph + extent; y += cellH) {
    for (let x = -extent; x < pw + extent; x += cellW) {
      cx.drawImage(swatch, x, y, cellW + 0.6, cellH + 0.6);
    }
  }
  cx.restore();
  return canvas;
}

/**
 * Knocks a plain background out of a product photograph by flood-filling
 * inward from the border.
 *
 * Works on the studio-white and near-white backdrops the catalogue uses,
 * and does nothing harmful on a busy one — it simply removes less. It
 * cannot cut a subject out of a room, and does not try.
 */
export function cutout(image: HTMLImageElement, maxEdge = 480): HTMLCanvasElement {
  const k = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(2, Math.round(image.naturalWidth * k));
  const h = Math.max(2, Math.round(image.naturalHeight * k));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const cx = canvas.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(image, 0, 0, w, h);

  const data = cx.getImageData(0, 0, w, h);
  const d = data.data;

  /* The background colour is read from the four corners rather than
     assumed white: a cream or grey backdrop is common. */
  const corner = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const corners = [corner(0, 0), corner(w - 1, 0), corner(0, h - 1), corner(w - 1, h - 1)];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, p) => s + p[c], 0) / 4));

  const near = (i: number) =>
    d[i + 3] < 10 ||
    (Math.abs(d[i] - bg[0]) < 30 &&
      Math.abs(d[i + 1] - bg[1]) < 30 &&
      Math.abs(d[i + 2] - bg[2]) < 30);

  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const j = py * w + px;
    if (seen[j] || !near(j * 4)) return;
    seen[j] = 1;
    stack.push(j);
  };

  for (let i = 0; i < w; i++) {
    push(i, 0);
    push(i, h - 1);
  }
  for (let j = 0; j < h; j++) {
    push(0, j);
    push(w - 1, j);
  }
  while (stack.length) {
    const j = stack.pop()!;
    const px = j % w;
    const py = (j / w) | 0;
    push(px + 1, py);
    push(px - 1, py);
    push(px, py + 1);
    push(px, py - 1);
  }

  for (let j = 0; j < w * h; j++) if (seen[j]) d[j * 4 + 3] = 0;
  /* Half-transparent edge, so the cut does not look scissored. */
  for (let py = 1; py < h - 1; py++) {
    for (let px = 1; px < w - 1; px++) {
      const j = py * w + px;
      if (!seen[j] && (seen[j - 1] || seen[j + 1] || seen[j - w] || seen[j + w])) {
        d[j * 4 + 3] = 150;
      }
    }
  }
  cx.putImageData(data, 0, 0);
  return canvas;
}

/** ---- Scene ------------------------------------------------------------- */

function quadPath(ctx: CanvasRenderingContext2D, q: Pt[]) {
  ctx.beginPath();
  q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}

function scratch(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d")! };
}

/** The customer's photograph, cover-fitted to the canvas by the caller. */
export function drawBase(ctx: CanvasRenderingContext2D, base: CanvasImageSource | null, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  if (base) {
    ctx.drawImage(base, 0, 0, w, h);
  } else {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, w, h);
  }
}

export interface SurfaceFill {
  /** A swatch to tile, or a plain colour for paint. */
  swatch?: Source | null;
  colour?: string;
}

/**
 * Lays a tile (or paints a colour) inside the quad, keeping the room's light.
 *
 * `mask` is the customer's erase layer — white where they have rubbed out
 * the surface to expose the sofa standing on it. `fast` drops mesh density
 * while a corner is being dragged so the preview stays live on a phone.
 */
export function drawSurface(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: CanvasImageSource | null,
  scene: SurfaceScene,
  fill: SurfaceFill,
  opts: { mask?: HTMLCanvasElement | null; fast?: boolean } = {},
) {
  const q = scene.quad.map((p): Pt => [p[0] * w, p[1] * h]);
  const layer = scratch(w, h);

  if (fill.swatch) {
    const plan = buildPlan(
      fill.swatch,
      scene.tileMm,
      scene.areaWidthFt * MM_PER_FT,
      scene.areaDepthFt * MM_PER_FT,
      scene.diagonal,
    );
    drawWarped(layer.ctx, plan, q, plan.width, plan.height, opts.fast ? 10 : 18);
    /* The room's own light, put back: soft-light keeps the tile's colour
       and borrows the photograph's highlights and shadows, which is what
       stops it looking like a sticker. */
    layer.ctx.globalCompositeOperation = "soft-light";
    layer.ctx.globalAlpha = 0.65;
    if (base) layer.ctx.drawImage(base, 0, 0, w, h);
    layer.ctx.globalAlpha = 1;
    layer.ctx.globalCompositeOperation = "source-over";
  } else if (fill.colour) {
    layer.ctx.fillStyle = fill.colour;
    quadPath(layer.ctx, q);
    layer.ctx.fill();
    /* Multiply keeps the wall's shading under the new colour. */
    if (base) {
      layer.ctx.globalCompositeOperation = "multiply";
      layer.ctx.globalAlpha = 0.45;
      layer.ctx.drawImage(base, 0, 0, w, h);
      layer.ctx.globalAlpha = 1;
      layer.ctx.globalCompositeOperation = "source-over";
    }
  }

  const clipped = scratch(w, h);
  clipped.ctx.save();
  quadPath(clipped.ctx, q);
  clipped.ctx.clip();
  clipped.ctx.drawImage(layer.canvas, 0, 0);
  clipped.ctx.restore();
  if (opts.mask) {
    clipped.ctx.globalCompositeOperation = "destination-out";
    clipped.ctx.drawImage(opts.mask, 0, 0, w, h);
    clipped.ctx.globalCompositeOperation = "source-over";
  }
  ctx.drawImage(clipped.canvas, 0, 0);
}

/** Where an object sits on the canvas, in pixels. */
export function objectBox(scene: ObjectScene, art: { width: number; height: number }, w: number, h: number) {
  const bw = (scene.widthCm / scene.roomWidthCm) * w;
  return { cx: scene.x * w, cy: scene.y * h, w: bw, h: bw * (art.height / art.width) };
}

export function drawObject(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: ObjectScene,
  art: HTMLCanvasElement,
) {
  const b = objectBox(scene, art, w, h);
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate((scene.rotation * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.30)";
  ctx.shadowBlur = b.w * 0.05;
  ctx.shadowOffsetY = b.w * 0.02;
  ctx.drawImage(art, -b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}

/** Crops a cut-out to the pixels that are actually there. */
export function trimToContent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < 40) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return canvas;
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * Fits the product's own photograph, cut out and trimmed, into the opening
 * the quad marks. The leaf is stretched to the opening: the page says so
 * and states the product's real size beside the opening's, so a door that
 * is really 6 inches narrower is not quietly drawn as if it fitted.
 */
export function drawDoor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: CanvasImageSource | null,
  quadNorm: Pt[],
  art: HTMLCanvasElement,
  opts: { fast?: boolean } = {},
) {
  const q = quadNorm.map((p): Pt => [p[0] * w, p[1] * h]);
  /* A dark reveal and a soft shadow, so the leaf sits in the opening. */
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = w * 0.02;
  ctx.shadowOffsetX = w * 0.005;
  ctx.shadowOffsetY = w * 0.004;
  ctx.fillStyle = "#2a1c12";
  quadPath(ctx, q);
  ctx.fill();
  ctx.restore();

  const layer = scratch(w, h);
  drawWarped(layer.ctx, art, q, art.width, art.height, opts.fast ? 8 : 14);
  /* A gentle side-to-side light, and a darker leaf in a dim room. The
     photograph's own pixels are not laid over the door: that would show
     the old door's panels through the new one. */
  const g = layer.ctx.createLinearGradient(q[0][0], 0, q[1][0], 0);
  g.addColorStop(0, "rgba(255,255,255,0.07)");
  g.addColorStop(1, "rgba(0,0,0,0.13)");
  layer.ctx.fillStyle = g;
  layer.ctx.fillRect(0, 0, w, h);
  if (base) {
    const lum = averageLuminance(base);
    if (lum < 0.55) {
      layer.ctx.fillStyle = `rgba(20,12,6,${((0.55 - lum) * 0.8).toFixed(2)})`;
      layer.ctx.fillRect(0, 0, w, h);
    }
  }
  const clipped = scratch(w, h);
  clipped.ctx.save();
  quadPath(clipped.ctx, q);
  clipped.ctx.clip();
  clipped.ctx.drawImage(layer.canvas, 0, 0);
  clipped.ctx.restore();
  ctx.drawImage(clipped.canvas, 0, 0);
}

/** Mean brightness, 0–1, from an 8×8 reduction. */
export function averageLuminance(source: CanvasImageSource): number {
  const c = scratch(8, 8);
  c.ctx.drawImage(source, 0, 0, 8, 8);
  const d = c.ctx.getImageData(0, 0, 8, 8).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  return sum / (d.length / 4);
}

/** A found-objects mask as a canvas the size of the photograph, for `drawSurface`'s erase layer. */
export function holesToCanvas(holes: { mask: Uint8Array; w: number; h: number }, w: number, h: number): HTMLCanvasElement {
  const small = scratch(holes.w, holes.h);
  const img = small.ctx.createImageData(holes.w, holes.h);
  for (let i = 0; i < holes.w * holes.h; i++) {
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = holes.mask[i];
  }
  small.ctx.putImageData(img, 0, 0);
  const out = scratch(w, h);
  out.ctx.drawImage(small.canvas, 0, 0, w, h);
  return out.canvas;
}

/** The dashed outline and corner handles. Drawn onto the preview only,
    never into the saved image. */
export function drawGuides(ctx: CanvasRenderingContext2D, quadNorm: Pt[], w: number, h: number) {
  const q = quadNorm.map((p): Pt => [p[0] * w, p[1] * h]);
  const r = Math.max(9, w * 0.022);
  ctx.save();
  ctx.lineWidth = Math.max(2, w * 0.004);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.setLineDash([w * 0.02, w * 0.012]);
  quadPath(ctx, q);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of q) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = "#7A4B28";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }
  ctx.restore();
}

export function drawObjectGuide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: ObjectScene,
  art: { width: number; height: number },
) {
  const b = objectBox(scene, art, w, h);
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate((scene.rotation * Math.PI) / 180);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(2, w * 0.004);
  ctx.setLineDash([w * 0.02, w * 0.012]);
  ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}

/** Where the quad starts: a floor patch or a wall patch. */
export function defaultQuad(surface: "floor" | "wall" | "door"): Pt[] {
  if (surface === "door") return [[0.3, 0.12], [0.7, 0.12], [0.7, 0.93], [0.3, 0.93]];
  return surface === "wall"
    ? [[0.2, 0.1], [0.8, 0.1], [0.8, 0.55], [0.2, 0.55]]
    : [[0.2, 0.57], [0.8, 0.57], [0.97, 0.96], [0.03, 0.96]];
}

/** Index of the corner within `reach` of the point, or -1. */
export function hitCorner(quad: Pt[], x: number, y: number, reach: number): number {
  let best = -1;
  let bestD = reach;
  quad.forEach((p, i) => {
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
