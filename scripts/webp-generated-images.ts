/**
 * Re-encode the generated catalogue imagery as WebP.
 *
 *   npx tsx scripts/webp-generated-images.ts --dry-run
 *   npx tsx scripts/webp-generated-images.ts --limit 50
 *   npx tsx scripts/webp-generated-images.ts
 *   npx tsx scripts/webp-generated-images.ts --delete-png
 *
 * `generate-product-images.ts` wrote whatever the provider returned, and
 * every provider returns PNG: 911 files averaging 1.2MB, 1.1GB in total.
 * That is more than a Vercel deploy will carry and far more than a
 * customer on mobile data should be asked to download for one tile in a
 * grid. The same picture as WebP is about a tenth of the size — the
 * figure `generate-studio-images.ts` already relies on, which is why
 * Studio's output never had this problem.
 *
 * Resumable and idempotent by construction: a PNG whose `.webp` already
 * exists is skipped, so an interrupted run is continued by running it
 * again, and running it twice changes nothing.
 *
 * The PNG is kept unless `--delete-png` says otherwise. `public/generated`
 * is gitignored, so the original is not recoverable from git the way
 * `public/catalogue` is — and a conversion is cheap to redo from a PNG
 * but impossible to undo without one.
 */
/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Served straight from `public/`, so the path is also the public URL. */
const OUT_DIR = path.join("public", "generated");

/** The same figure `generate-studio-images.ts` encodes at. */
const QUALITY = 82;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const deletePng = process.argv.includes("--delete-png");
  const limit = Number(arg("limit")) || undefined;

  const all = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".png"));
  /* A file the generator is still writing has no `.webp` yet and would
     convert to a truncated image. The run writes one file per ~12s, so
     anything untouched for a minute is finished. */
  const settled: string[] = [];
  for (const f of all) {
    const { mtimeMs } = await stat(path.join(OUT_DIR, f));
    if (Date.now() - mtimeMs > 60_000) settled.push(f);
  }

  const queue = settled
    .filter((f) => !existsSync(path.join(OUT_DIR, f.replace(/\.png$/, ".webp"))))
    .slice(0, limit);

  console.info(
    `${all.length} png · ${all.length - settled.length} still being written · ${queue.length} to convert`,
  );
  if (queue.length === 0) return;

  let before = 0;
  let after = 0;
  let converted = 0;
  let relinked = 0;

  for (const [i, file] of queue.entries()) {
    const sku = file.replace(/\.png$/, "");
    const from = path.join(OUT_DIR, file);
    const to = path.join(OUT_DIR, `${sku}.webp`);

    const png = await readFile(from);
    const webp = await sharp(png).webp({ quality: QUALITY }).toBuffer();
    before += png.length;
    after += webp.length;

    if (!dryRun) {
      await writeFile(to, webp);
      /* Scoped by the stored path as well as the SKU: a product whose
         picture has since been replaced by a real photograph must not be
         pointed back at the illustration. */
      const { count } = await db.product.updateMany({
        where: { sku, image: `/generated/${file}` },
        data: { image: `/generated/${sku}.webp` },
      });
      relinked += count;
      if (deletePng) await unlink(from);
    }
    converted++;

    if ((i + 1) % 100 === 0 || i === queue.length - 1) {
      console.info(`  [${i + 1}/${queue.length}] ${(after / before * 100).toFixed(0)}% of original so far`);
    }
  }

  const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
  console.info(
    `\n${dryRun ? "would convert" : "converted"} ${converted} · ${mb(before)}MB -> ${mb(after)}MB` +
      ` (${(after / before * 100).toFixed(0)}%)`,
  );
  console.info(`${dryRun ? "would relink" : "relinked"} ${relinked} product row(s)`);
  if (!deletePng && !dryRun) {
    console.info("PNG originals kept. Re-run with --delete-png once the WebP set is confirmed good.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
