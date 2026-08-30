/**
 * Crops the navigation photographs down to their subjects.
 *
 *   npm run images:nav
 *
 * The entry tiles and the tab rail draw catalogue photographs at 96px and
 * 64px. Those files are shot the way product photography always is — the
 * object centred, small, in a wide field of white so it can be dropped on
 * any page. Rendered into a 64px circle that framing is mostly background:
 * the subject occupies perhaps a third of the width, and the rest is the
 * cyclorama, so the tab reads as an empty white disc with something in the
 * middle of it.
 *
 * Fixing that in CSS means a per-image zoom, guessed by eye, that is wrong
 * again the moment anyone swaps a file. Fixing it here means measuring
 * each photograph and cutting exactly the border that is background, which
 * is what `trim` does — it walks in from the edges while the pixels match
 * the corner colour, and stops at the object.
 *
 * Output is committed, like `public/catalogue/` before it. These are
 * derived files and could be built on demand, but ten thumbnails totalling
 * a few hundred kilobytes are not worth a build step that has to run
 * before the storefront renders correctly.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Every file the storefront navigation points at.
 *
 * Deliberately a list here rather than an import from
 * `src/lib/catalogue-imagery.ts`: that module is what the *output* of this
 * script is described by, and importing it would make the script depend on
 * the paths it is supposed to be producing.
 */
const SOURCES: { from: string; name: string }[] = [
  { from: "catalogue/imported/LAMCKXLAM6HFRY.jpg", name: "wood-laminate" },
  { from: "catalogue/imported/DOODORDGD99FZA.jpg", name: "door-hardware" },
  { from: "catalogue/imported/TMTRATTMTLEMDG.jpg", name: "steel-bars" },
  { from: "catalogue/imported/SHOGENROU2FE8C.jpg", name: "shower-head" },
  { from: "catalogue/imported/ENZEK.jpg", name: "quartz-sink" },
  { from: "catalogue/imported/LIGPOLSPOZXVGW.jpg", name: "downlight" },
];

const PUBLIC = path.join(process.cwd(), "public");
const OUT_DIR = path.join(PUBLIC, "nav");

/**
 * 320px square. Twice the largest box these are drawn in (96px at the
 * tiles, plus headroom), so a 2x screen still gets a real pixel per
 * rendered pixel and `next/image` has something to downscale from.
 */
const SIZE = 320;

/**
 * How far a pixel may drift from the corner colour and still count as
 * background.
 *
 * These are photographs, not flat renders: the "white" surround carries
 * JPEG noise and a soft gradient towards the object's shadow. At 0 the
 * trim stops on the first noisy pixel and removes nothing. Too high and it
 * eats into the object — a chrome shower head is mostly pale grey, and a
 * generous threshold will happily decide the shower head is background.
 */
const TRIM_THRESHOLD = 12;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const { from, name } of SOURCES) {
    const source = path.join(PUBLIC, from);

    const trimmed = await sharp(source)
      /* `trim` reports what it removed in the output info, which is the
         only way to notice that a file's background was not uniform and
         nothing was cut. */
      .trim({ threshold: TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true });

    const before = await sharp(source).metadata();
    const cutW = (before.width ?? 0) - trimmed.info.width;
    const cutH = (before.height ?? 0) - trimmed.info.height;

    await sharp(trimmed.data)
      /* `cover` on the already-trimmed subject: the object now touches at
         least two edges, so squaring it crops the long axis of the object
         rather than trimming more background. That is the intent — these
         are circles and rounded squares, and a subject that fills them
         reads at 64px where a correctly-proportioned one does not. */
      .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toFile(path.join(OUT_DIR, `${name}.webp`));

    console.log(
      `${name.padEnd(14)} ${before.width}x${before.height} → trimmed ${cutW}x${cutH} → ${SIZE}px` +
        (cutW === 0 && cutH === 0 ? "  (nothing trimmed — check the background)" : ""),
    );
  }

  await writeFile(
    path.join(OUT_DIR, "README.md"),
    "# Generated\n\nBuilt by `npm run images:nav` from the catalogue photographs\n" +
      "listed in `scripts/build-nav-thumbnails.ts`. Do not edit by hand —\n" +
      "re-run the script instead.\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
