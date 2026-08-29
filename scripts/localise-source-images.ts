/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

/**
 * Download the captured product photography and serve it from Quoin.
 *
 *   npx tsx scripts/localise-source-images.ts --dry-run
 *   npx tsx scripts/localise-source-images.ts --limit 50
 *   npx tsx scripts/localise-source-images.ts
 *
 * Until now those images were hotlinked: the browser fetched them from
 * the CDN they were captured from, and Quoin held no copy. This makes a
 * copy and serves it, which removes the dependency on someone else's
 * server staying up and willing — and is a larger step than linking,
 * because the images belong to those sites and their manufacturers.
 * Replace them with licensed photography as it arrives; the path is one
 * column and the components already take whichever exists.
 *
 * Resumable: a product that already has its own image is skipped, and a
 * file already on disk is not fetched again.
 */
const db = new PrismaClient();

const OUT_DIR = path.join("public", "catalogue", "imported");

/* Their servers, not ours. Small concurrency and a pause between batches. */
const CONCURRENCY = 4;
const PAUSE_MS = 250;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 4_000_000;

/* These are catalogue tiles, never shown above ~400px. Storing the CDN's
   full-resolution original costs about eight times the bytes for pixels
   nothing displays. */
const MAX_EDGE = 800;
const JPEG_QUALITY = 82;

interface Target {
  id: string;
  sku: string;
  sourceImageUrl: string;
}

async function download(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/*" },
      referrer: "",
    });
    if (!res.ok) return null;

    /* A CDN that has removed an image often answers with an HTML page
       rather than a 404, and writing that to disk as .jpg produces a
       product tile that fails to decode. */
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length > 0 && bytes.length <= MAX_BYTES ? bytes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg === -1 ? undefined : Number(args[limitArg + 1]);

  const targets = (await db.product.findMany({
    where: { isActive: true, image: "", NOT: { sourceImageUrl: null } },
    select: { id: true, sku: true, sourceImageUrl: true },
    orderBy: { name: "asc" },
    take: limit,
  })) as Target[];

  console.info(`${targets.length} product(s) with a captured image and none of their own`);
  if (!targets.length) return;

  if (dryRun) {
    for (const t of targets.slice(0, 5)) console.info(`  ${t.sku} <- ${t.sourceImageUrl}`);
    console.info("dry run — nothing downloaded");
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (target) => {
        /* Named by SKU: the CDN's filename means nothing here, and this
           makes the file obviously belong to the product. */
        const file = `${target.sku.replace(/[^A-Za-z0-9._-]/g, "_")}.jpg`;
        const full = path.join(OUT_DIR, file);
        const image = `/catalogue/imported/${file}`;

        if (existsSync(full)) {
          await db.product.update({ where: { id: target.id }, data: { image } });
          skipped++;
          return;
        }

        const bytes = await download(target.sourceImageUrl);
        if (!bytes) {
          failed++;
          return;
        }

        let out: Buffer;
        try {
          out = await sharp(bytes)
            .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
            /* Flattened onto white: a transparent PNG re-encoded as JPEG
               goes black behind the product otherwise. */
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: JPEG_QUALITY, progressive: true })
            .toBuffer();
        } catch {
          /* Not a decodable image, whatever the content type claimed. */
          failed++;
          return;
        }

        await writeFile(full, out);
        /* The row points at the local copy only once the copy exists, so
           an interrupted run never leaves a product pointing at nothing. */
        await db.product.update({ where: { id: target.id }, data: { image } });
        saved++;
      }),
    );

    if ((i / CONCURRENCY) % 10 === 0) {
      console.info(`  ${i + batch.length}/${targets.length} — saved ${saved}, failed ${failed}`);
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  console.info(`\nsaved ${saved}, already had ${skipped}, failed ${failed}`);
  if (failed) {
    console.info(`${failed} kept their remote URL — they still need SHOW_SOURCE_IMAGES to show anything.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
