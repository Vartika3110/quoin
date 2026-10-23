/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

/**
 * Which catalogue photographs are shot on a plain ground.
 *
 * The shelf sidebar puts a product in a 56px disc, and a disc the colour
 * of studio white makes a photograph shot on studio white look like a
 * cutout. A photograph shot in a *room* does not: the dish drainer
 * brings its worktop and the drawer brings its cabinet, and the column
 * goes back to being a stack of little pictures of different places.
 *
 * Nothing in the catalogue records which is which, so this looks. It
 * samples the border of each image — the ring a thumbnail shows most of
 * — and calls the photograph plain when that ring is near-uniform and
 * light. Studio shots pass; a worktop, a cabinet interior or a tiled
 * wall does not.
 *
 * The result is written as a generated module rather than a column,
 * because it is a fact about the *file* and not about the product: it
 * changes when the photograph is replaced, which is exactly when this
 * should be re-run.
 *
 *   npx tsx scripts/audit-photo-backgrounds.ts
 */
const db = new PrismaClient();

const OUT = "src/lib/plain-background-photos.ts";

/** How far a border pixel may sit from the mean and still count as flat. */
const SPREAD = 18;
/** How light the ground has to be. Studio white, not a dark backdrop. */
const FLOOR = 205;

async function isPlain(file: string): Promise<boolean> {
  /* Downscaled first: the question is about the broad ground, not about
     a stray pixel, and a 64px raster answers it for a fraction of the
     work. `flatten` so a transparent PNG is judged on white, which is
     what it will be composited onto. */
  const { data, info } = await sharp(file)
    .resize(64, 64, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const samples: number[][] = [];

  const at = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  /* The outermost ring, every few pixels: the part of the frame a
     thumbnail shows most of and the product occupies least. */
  for (let x = 0; x < width; x += 3) {
    samples.push(at(x, 0), at(x, height - 1));
  }
  for (let y = 0; y < height; y += 3) {
    samples.push(at(0, y), at(width - 1, y));
  }

  const mean = [0, 1, 2].map(
    (c) => samples.reduce((sum, s) => sum + s[c], 0) / samples.length,
  );
  if (Math.min(...mean) < FLOOR) return false;

  return samples.every((s) =>
    s.every((v, c) => Math.abs(v - mean[c]) <= SPREAD),
  );
}

async function main() {
  const products = await db.product.findMany({
    where: { isActive: true, variants: { some: { isActive: true } }, NOT: { image: "" } },
    select: { image: true },
    orderBy: { image: "asc" },
  });

  /* Local files only. The rest are in the catalogue bucket, and
     downloading the catalogue to answer a layout question is not a
     trade worth making — an unlisted photograph simply does not get the
     preference, which is the same outcome as before this existed. */
  const local = [...new Set(products.map((p) => p.image))].filter((i) =>
    i.startsWith("/"),
  );

  const plain: string[] = [];
  let unreadable = 0;

  for (const image of local) {
    try {
      if (await isPlain(path.join("public", image))) plain.push(image);
    } catch {
      unreadable += 1;
    }
  }

  const body = `/**
 * Catalogue photographs shot on a plain, light ground.
 *
 * **Generated — do not edit.** \`npx tsx scripts/audit-photo-backgrounds.ts\`
 * rewrites this file by looking at the images in \`public/\`; the script
 * carries the reasoning and the thresholds.
 *
 * Used by \`pickThumbnail\` to choose which product stands for a shelf in
 * the sidebar: on a white disc, a studio shot reads as a cutout and a
 * photograph taken in a room brings the room with it.
 *
 * ${plain.length} of ${local.length} local photographs qualify.
 */
export const PLAIN_BACKGROUND_PHOTOS: ReadonlySet<string> = new Set([
${plain.map((i) => `  ${JSON.stringify(i)},`).join("\n")}
]);
`;

  await writeFile(OUT, body);
  console.log(
    `${plain.length} of ${local.length} local photographs are plain` +
      (unreadable ? ` (${unreadable} unreadable)` : "") +
      `\nwritten: ${OUT}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
