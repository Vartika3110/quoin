/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

/**
 * Attach illustrations supplied as one contact sheet.
 *
 *   npx tsx scripts/import-illustration-sheet.ts <sheet.png> --dry-run
 *   npx tsx scripts/import-illustration-sheet.ts <sheet.png>
 *
 * The sheet is a grid of cells, each a picture above its caption. The
 * captions are transcribed below in reading order rather than read off
 * the pixels: a misread caption hangs a picture on the wrong product and
 * nothing downstream would catch it.
 *
 * Everything imported here is flagged `imageIsGenerated`, so the card and
 * the detail page carry "Illustration - actual product may vary". These
 * depict the kind of part, not the part itself, and saying so is what
 * separates an illustrated catalogue from a misleading one.
 */
const db = new PrismaClient();

const OUT_DIR = path.join("public", "catalogue", "illustrated");

/** Captions in reading order: the 7-cell band, then the 9-wide grid. */
const CAPTIONS = [
  "Ashirvad Flowguard Plus 1 Step CPVC Yellow Medium Solvent Cement",
  "Astral Ball Valve Long Handle CPVC",
  "Astral MTA Brass CPVC",
  "Astral Reducing MTA Brass CPVC",
  "Astral Solvent CPVC",
  "Ebco PVC Skirting Joints, 100mm, Black",
  "Ebco PVC Skirting, Height 100mm, Black",

  "Ebco 165 Hinge, Regular Close, 1 Set (2 Nos)",
  "Ebco Aluminium Profile Cabinet Edge, Length 3m",
  "Ebco Aluminium Profile Shutter Handle End Cap, EC-1935-AB, Anodised Black, L+R Set",
  "Ebco Aluminium Profile Shutter Handle, SH1-1935-3M-AB, Anodised Black, 19mm X 35mm, 3m",
  "Ebco Aluminium Shutter Grill",
  "Ebco Anti Skid Mat 5, Anthracite, Cross, 5m (L) X 51cm (W)",
  "Ebco Auto Pull Out Waste Bin, 28L (2 X 14L)",
  "Ebco Bottle Pullout, Soft Close, 2 Tier",
  "Ebco Cabinet Shelf Support Pin",

  "Ebco Cup & Saucer Kitchen Basket, SS304",
  "Ebco Cutlery Kitchen Basket, SS304",
  "Ebco Eurolift Bi-Fold Door System, Soft Close",
  "Ebco Fascia Bracket for POWB4-40-AT",
  "Ebco Hi Slide 50 Reversible Sliding Mechanism, Soft Close (Door Fitting)",
  "Ebco Hinge Drilling Template for HAP",
  "Ebco Light Adapter Series 2, 24V 24W Power Supply Unit for LED Lights",
  "Ebco Light Linear 2 Way LED Strip Light for 8mm Glass, 4000K, 24V",
  "Ebco Livsmart Pulldown System for 900mm Kitchen Cabinets",

  "Ebco Luminor 8C, Aluminium Heat Sink Profile with Diffusor Profile, Length 3m",
  "Ebco MS Wardrobe Rail Bracket, WRF-B2",
  "Ebco Magic Corner Max 90, Single Pullout",
  "Ebco Mounting Screw Kit for Pro-Lift Bed Fittings",
  "Ebco Pantry Unit, Soft Close",
  "Ebco Plain Kitchen Basket, SS304",
  "Ebco Plate Kitchen Basket, SS304",
  "Ebco Pro Lift Bed Fitting Extended Arm Set, Heavy Duty",
  "Ebco Pro Lift Bed Hydraulic Gas Pump",

  "Ebco Pro Lift Cabinet Gas Pump",
  "Ebco Pro Lift Cabinet Gas Pump, 20 Kg",
  "Ebco Pro Motion Tandem Box, S3 Series, 50Kg, Full Set",
  "Ebco Pull Out Waste Bin, 40L (2 X 20L)",
  "Ebco Push Open Fitting, Magnetic, Stroke 40mm",
  "Ebco Roll Top Pro Vertical Rolling Shutter",
  "Ebco Side Pullout, Frameless, SS304",
  "Ebco Soft Close Dangler",
  "Ebco Telescopic Channel, 40Kg, 600mm, 1 Pair",
];

/**
 * Where each picture sits in the sheet.
 *
 * Two bands with different column counts, measured off the sheet rather
 * than assumed. The nine-wide rows are 190px, not 191 — a pixel of drift
 * per row puts the fourth row's crop inside its own captions.
 *
 * The caption's height is found per cell rather than fixed, because it
 * sits directly under the picture and the pictures are not all the same
 * height. A single cut-off that clears the tallest product slices through
 * the caption of the shortest.
 */
const SHEET_WIDTH = 1536;
const BANDS = [
  { count: 7, columns: 7, top: 30, rowHeight: 200 },
  { count: 36, columns: 9, top: 260, rowHeight: 190 },
];

function cellBox(index: number) {
  let seen = 0;
  for (const band of BANDS) {
    if (index < seen + band.count) {
      const local = index - seen;
      const width = SHEET_WIDTH / band.columns;
      return {
        left: Math.round((local % band.columns) * width) + 2,
        top: band.top + Math.floor(local / band.columns) * band.rowHeight + 2,
        width: Math.round(width) - 4,
        height: band.rowHeight - 6,
      };
    }
    seen += band.count;
  }
  throw new Error(`cell ${index} is outside the sheet`);
}

/**
 * The height of the picture inside a cell, up to where its caption starts.
 *
 * Found from the bottom, not the top. A caption is always the last thing
 * in a cell, so walking up from the floor and stopping at the first real
 * band of white finds its top edge exactly. Walking down from the ceiling
 * instead stops at the first white band inside the product — and a screw
 * pair, a hinge, a pair of gas pumps are all mostly white space between
 * parts, which cropped half of them away to nothing.
 */
async function artHeight(sheet: string, box: ReturnType<typeof cellBox>): Promise<number> {
  const { data, info } = await sharp(sheet)
    .extract(box)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const inked: boolean[] = [];
  for (let y = 0; y < info.height; y++) {
    let dark = 0;
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < 150) dark++;
    }
    inked.push(dark / info.width > 0.02);
  }

  let y = info.height - 1;
  while (y >= 0 && !inked[y]) y--; // trailing white below the caption
  if (y < 0) return info.height;

  /* Up through the caption. Its lines are separated by a few clean rows,
     so only a wider band counts as the boundary above it. */
  let gap = 0;
  for (; y >= 0; y--) {
    if (inked[y]) {
      gap = 0;
      continue;
    }
    /* `y` is the topmost row of the gap and the picture ends above it.
       Returning y + gap would hand back the gap and the caption's first
       line with it. */
    if (++gap >= 8) return y + 1;
  }
  return info.height;
}


const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );

function overlap(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * A caption must clearly identify one product. Below this the runner-up is
 * close enough that the wrong picture is a real possibility, and these
 * differ by a size or a finish — exactly the distinction a picture is
 * relied on to show.
 */
const MIN_SCORE = 0.5;
const MIN_MARGIN = 0.08;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sheet = args.find((a) => !a.startsWith("--"));
  if (!sheet) throw new Error("usage: import-illustration-sheet.ts <sheet.png> [--dry-run]");

  /* Products that already carry Quoin's own catalogue photography keep it:
     a photograph of the actual part beats a drawing of its kind. */
  const candidates = await db.product.findMany({
    where: {
      isActive: true,
      OR: [{ image: "" }, { image: { startsWith: "/catalogue/imported/" } }, { imageIsGenerated: true }],
    },
    select: { id: true, sku: true, name: true, brand: { select: { name: true } } },
  });
  const indexed = candidates.map((p) => ({ ...p, t: tokens(`${p.brand?.name ?? ""} ${p.name}`) }));

  let matched = 0;
  const ambiguous: string[] = [];

  for (const [i, caption] of CAPTIONS.entries()) {
    const ct = tokens(caption);
    const scored = indexed
      .map((p) => ({ p, score: overlap(ct, p.t) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const margin = best ? best.score - (scored[1]?.score ?? 0) : 0;

    if (!best || best.score < MIN_SCORE || margin < MIN_MARGIN) {
      ambiguous.push(`cell ${i}: "${caption.slice(0, 46)}" (best ${best?.score.toFixed(2)}, margin ${margin.toFixed(2)})`);
      continue;
    }

    matched++;
    if (dryRun) {
      console.info(`  ${String(i).padStart(2)}  ${best.score.toFixed(2)}  ${best.p.sku.padEnd(18)} ${best.p.name.slice(0, 44)}`);
      continue;
    }

    await mkdir(OUT_DIR, { recursive: true });
    const file = `${best.p.sku.replace(/[^A-Za-z0-9._-]/g, "_")}.jpg`;

    const box = cellBox(i);
    const height = await artHeight(sheet, box);

    await sharp(sheet)
      .extract({ ...box, height })
      /* Trim the cell's white margin so the part fills its own frame the
         way a photographed product does. */
      .trim({ threshold: 12 })
      .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88, progressive: true })
      .toFile(path.join(OUT_DIR, file));

    await db.product.update({
      where: { id: best.p.id },
      data: { image: `/catalogue/illustrated/${file}`, imageIsGenerated: true },
    });
    console.info(`  ${best.p.sku.padEnd(18)} ${best.p.name.slice(0, 50)}`);
  }

  console.info(`\n${matched} of ${CAPTIONS.length} captions matched a product`);
  if (ambiguous.length) {
    console.info(`${ambiguous.length} left unmatched rather than guessed:`);
    ambiguous.forEach((a) => console.info("  " + a));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
