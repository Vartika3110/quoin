/**
 * Put every catalogue photograph on the same white square.
 *
 *   npx tsx scripts/normalise-catalogue-images.ts --dry-run
 *   npx tsx scripts/normalise-catalogue-images.ts --folder imported
 *   npx tsx scripts/normalise-catalogue-images.ts
 *
 * The catalogue was assembled from four sources — `jaquar`, `jaquar-technical`,
 * `imported` and `illustrated` — and it shows: 2,482 files ranging from 103px
 * to 1,454px, only 550 of them square, some on white, some on grey, some
 * photographed in a room. A grid of those is visibly second-hand, which is
 * the opposite of what a product grid is for.
 *
 * So each file is trimmed of its existing margin, scaled to fill a fixed
 * share of a square canvas, and centred on pure white. `ProductCard`
 * renders `aspect-square`, so a square source is the one shape that never
 * gets letterboxed by the storefront.
 *
 * **Rewritten in place, deliberately.** Every one of these files is tracked
 * in git, so the originals are one `git checkout` away, and keeping the
 * filename means `Product.image` still points at the right picture — a
 * rename would mean a database migration for a cosmetic change.
 *
 * **What it refuses to touch.** A file photographed against a dark or
 * coloured ground cannot be turned into a white-background product shot by
 * resizing it; that needs the picture taken again, or generated. Those are
 * detected, skipped, and listed at the end for exactly that. Pretending a
 * kitchen scene is a product cut-out by padding it with white would make
 * the grid look worse, not better.
 */
/* Must be first: populates process.env before anything reads it. */
import "../src/lib/load-env-file";

import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

const CATALOGUE = path.join("public", "catalogue");

/** One canvas for the whole catalogue. 800px covers the 75th percentile of
    today's widths (600px) with room to spare, without upscaling the large
    Jaquar shots down to mush or the small ones beyond recognition. */
const CANVAS = 800;

/** How much of the canvas the product itself fills. The remainder is even
    white margin — the thing that makes a grid of unrelated products read as
    one set, and what the tight-cropped `imported` files lack today. */
const FILL = 0.88;

/** A 103px file blown up to 704px is a smear. Past this the product is
    centred at its own scale instead, small but honest. 3.5 is where a
    300px source — the 25th percentile of this catalogue — still fills the
    frame, and the few files smaller than that are better re-shot than
    enlarged further. */
const MAX_UPSCALE = 3.5;

/* Border-brightness thresholds, shared with the audit that produced the
   skip list. Mean luminance of the outer ring: a white studio ground sits
   above 232, a grey or tinted one below it, a room scene far below. */
const TINTED_BELOW = 232;
const DARK_BELOW = 200;

interface Verdict {
  file: string;
  mean: number;
  action:
    | "normalised"
    | "skipped: already square"
    | "skipped: tinted ground"
    | "skipped: dark or scene"
    | "failed";
  note?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Mean luminance of the outer ring of pixels — the background, wherever
    the product does not reach. Measured on a 48px thumbnail because the
    question is "what colour is the paper", not "what is in the picture". */
async function borderBrightness(file: string): Promise<number> {
  const { data, info } = await sharp(file)
    .resize(48, 48, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let count = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const edge = x < 3 || y < 3 || x >= info.width - 3 || y >= info.height - 3;
      if (!edge) continue;
      const i = (y * info.width + x) * info.channels;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count += 1;
    }
  }
  return sum / count;
}

/**
 * From one axis's ink counts, the span the product actually occupies.
 *
 * Counting ink per line is not enough on its own, which the first attempt
 * at this proved: a one-pixel rule down the left edge of a scan has *every*
 * pixel of its column inked, so any per-line threshold waves it straight
 * through, and the product is then scaled to share the frame with it.
 *
 * What separates a rule from a product is width, not density. So the
 * inked lines are grouped into contiguous runs, and a run is kept only if
 * it is at least a fifth as wide as the widest one. A 1px rule beside a
 * 300px product is dropped; two gas struts standing apart are both wide
 * enough to keep, and the span covers them both.
 */
function span(counts: number[], minimum: number): [number, number] | null {
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < counts.length; i++) {
    const inked = counts[i] >= minimum;
    if (inked && start === -1) start = i;
    if (!inked && start !== -1) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start !== -1) runs.push([start, counts.length - 1]);
  if (runs.length === 0) return null;

  const widest = Math.max(...runs.map(([a, b]) => b - a + 1));
  const kept = runs.filter(([a, b]) => b - a + 1 >= Math.max(2, widest * 0.2));
  if (kept.length === 0) return null;

  return [kept[0][0], kept[kept.length - 1][1]];
}

/**
 * The box the *product* occupies, ignoring hairlines.
 *
 * `sharp.trim()` is the obvious tool and the wrong one here: it stops at
 * the first pixel that differs from the corner colour, and a good number
 * of these files carry a one-pixel grey rule down an edge — a leftover
 * from whatever page they were cut out of. Trim keeps that rule, the rule
 * becomes part of the content box, and the product is then scaled to share
 * the frame with a line nobody can see. That is exactly how the first run
 * of this script left every `illustrated` product at half size.
 *
 * So content is counted rather than bounded: a column or row belongs to
 * the product only if at least 1% of its pixels are darker than paper. A
 * hairline never clears that bar; a genuine thin part of a product — a tap
 * spout, a drawer runner — spans far more than 1% of its own axis.
 */
async function contentBox(
  image: Buffer,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const { data, info } = await sharp(image)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  /* Anything darker than this is ink rather than paper. Set below pure
     white so JPEG noise and a faint studio gradient stay background. */
  const INK = 238;
  const minColumn = Math.max(2, Math.round(height * 0.01));
  const minRow = Math.max(2, Math.round(width * 0.01));

  const columns = new Array<number>(width).fill(0);
  const rows = new Array<number>(height).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < INK) {
        columns[x] += 1;
        rows[y] += 1;
      }
    }
  }

  const horizontal = span(columns, minColumn);
  const vertical = span(rows, minRow);
  if (!horizontal || !vertical) return null;

  const [left, right] = horizontal;
  const [top, bottom] = vertical;

  /* A breath of the original margin, so a product is not cut flush at the
     pixel its darkest edge happens to fall on. */
  const pad = Math.round(Math.max(width, height) * 0.01);
  const x0 = Math.max(0, left - pad);
  const y0 = Math.max(0, top - pad);
  const x1 = Math.min(width - 1, right + pad);
  const y1 = Math.min(height - 1, bottom + pad);

  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * Trims the existing margin, then rebuilds the picture on a white square.
 *
 * `trim` is what makes the *product* a consistent size rather than the
 * file: two photographs of the same tap, one shot close and one with a
 * hand's width of air around it, are the same picture once their margins
 * are removed, and only then does scaling them to a shared fraction of the
 * canvas mean anything.
 */
async function normalise(file: string, extension: string): Promise<Buffer> {
  const flattened = await sharp(file).flatten({ background: "#ffffff" }).toBuffer();

  const box = await contentBox(flattened);
  const trimmed = box
    ? await sharp(flattened).extract(box).toBuffer()
    : flattened;

  const meta = await sharp(trimmed).metadata();
  const width = meta.width ?? CANVAS;
  const height = meta.height ?? CANVAS;

  const target = Math.round(CANVAS * FILL);
  const scale = Math.min(target / Math.max(width, height), MAX_UPSCALE);
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));

  const product = await sharp(trimmed)
    .resize(drawWidth, drawHeight, { fit: "inside" })
    /* Lifts a near-white ground the last few points to true white without
       flattening the product's own highlights: only pixels already brighter
       than the paper move, which is why this runs after the trim rather
       than on the original's darker edges. */
    .linear(1.06, -14)
    .toBuffer();

  /* Encoded in this same chain, not by re-reading the result. A `create`
     pipeline has no input format to inherit, so its `toBuffer()` hands back
     raw pixels — 800x800x4 bytes — and feeding those to a second `sharp()`
     fails with "unsupported image format", which is what it does mean but
     not what it sounds like. Same format in, same format out: `Product.image`
     holds the extension, so changing it would mean rewriting every row for
     a cosmetic pass. */
  const canvas = sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 3,
      background: "#ffffff",
    },
  }).composite([{ input: product, gravity: "centre" }]);

  if (extension === ".png") return canvas.png({ compressionLevel: 9 }).toBuffer();
  if (extension === ".webp") return canvas.webp({ quality: 90 }).toBuffer();
  return canvas.jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const only = arg("folder");
  const limit = Number(arg("limit")) || undefined;

  const folders = readdirSync(CATALOGUE)
    .filter((d) => statSync(path.join(CATALOGUE, d)).isDirectory())
    .filter((d) => !only || d === only);

  const verdicts: Verdict[] = [];

  for (const folder of folders) {
    const files = readdirSync(path.join(CATALOGUE, folder))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .slice(0, limit);

    for (const name of files) {
      const file = path.join(CATALOGUE, folder, name);
      const label = `${folder}/${name}`;

      try {
        /* Already done. This script rewrites files in place, so without
           this guard a second run would trim the canvas it drew on the
           first — shrinking the product a little further every time it is
           run. `--force` exists for the case where the rules below change
           and every file genuinely needs redoing from its original, which
           is a `git checkout` away. */
        const existing = await sharp(file).metadata();
        if (
          !process.argv.includes("--force") &&
          existing.width === CANVAS &&
          existing.height === CANVAS
        ) {
          verdicts.push({ file: label, mean: 255, action: "skipped: already square" });
          continue;
        }

        const mean = await borderBrightness(file);

        if (mean < DARK_BELOW) {
          verdicts.push({ file: label, mean, action: "skipped: dark or scene" });
          continue;
        }
        if (mean < TINTED_BELOW) {
          verdicts.push({ file: label, mean, action: "skipped: tinted ground" });
          continue;
        }

        if (!dryRun) {
          writeFileSync(file, await normalise(file, path.extname(name).toLowerCase()));
        }
        verdicts.push({ file: label, mean, action: "normalised" });
      } catch (error) {
        verdicts.push({
          file: label,
          mean: 0,
          action: "failed",
          note: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  const count = (action: Verdict["action"]) =>
    verdicts.filter((v) => v.action === action).length;

  console.log(dryRun ? "\nDRY RUN — nothing was written\n" : "\nDone\n");
  console.log(`normalised to ${CANVAS}x${CANVAS} white ... ${count("normalised")}`);
  console.log(`skipped, already square .............. ${count("skipped: already square")}`);
  console.log(`skipped, tinted ground ............... ${count("skipped: tinted ground")}`);
  console.log(`skipped, dark or scene ............... ${count("skipped: dark or scene")}`);
  console.log(`failed ............................... ${count("failed")}`);

  /* Only the two that a resize cannot fix. An "already square" skip is a
     file this script finished with earlier, not a file needing a camera. */
  const needsNewPhoto = verdicts.filter(
    (v) =>
      v.action === "skipped: tinted ground" || v.action === "skipped: dark or scene",
  );
  const report = path.join("public", "catalogue", "needs-new-photo.csv");
  writeFileSync(
    report,
    ["file,background_brightness,reason"]
      .concat(needsNewPhoto.map((v) => `${v.file},${v.mean.toFixed(0)},"${v.action}"`))
      .join("\n"),
  );
  console.log(`\nFiles that need the picture taken again: ${report}`);

  for (const failure of verdicts.filter((v) => v.action === "failed").slice(0, 10)) {
    console.log(`  failed: ${failure.file} — ${failure.note}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
