/**
 * Generate a catalogue image for every product that lacks one.
 *
 *   npx tsx scripts/generate-product-images.ts --dry-run
 *   npx tsx scripts/generate-product-images.ts --limit 20
 *   npx tsx scripts/generate-product-images.ts --category paints-finishes
 *   npx tsx scripts/generate-product-images.ts --regenerate --quality medium
 *   npx tsx scripts/generate-product-images.ts --provider gemini
 *   npx tsx scripts/generate-product-images.ts --openai-model gpt-image-1-mini
 *   npx tsx scripts/generate-product-images.ts
 *
 * Provider is chosen by `liveGenerator` from whichever key is funded,
 * preferring OpenAI because a square tile at `low` is its cheapest tier
 * and Gemini has no equivalent discount — see the cost note there before
 * assuming the opposite, which the Studio job would tell you.
 *
 * Resumable by construction: it only selects products whose `image` is
 * still empty, so an interrupted run is continued by running it again.
 * Nothing is ever regenerated, because every regeneration is money.
 *
 * `--regenerate` is the deliberate exception, and it selects the opposite
 * set: rows that already carry generated art. The first pass ran at
 * `low`, which is 1024px of very little detail — mushy edges and no
 * texture, whatever the pixel count says. `--quality medium` is about
 * eight times the price and looks like a photograph rather than a
 * smudge. It rewrites `image` back to the local path so
 * `upload-catalogue-images.ts` picks the new file up and replaces the
 * object in the bucket.
 *
 * Everything written here is flagged `imageIsGenerated`, and the
 * storefront labels those as illustrations. See src/lib/images/generator.ts.
 */
/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { PrismaClient, type ImageQuality } from "@prisma/client";

import {
  DryRunGenerator,
  buildPrompt,
  liveGenerator,
  type ImageGenerator,
} from "../src/lib/images/generator";

const db = new PrismaClient();

/** What a given target is an upgrade *from*. */
const BELOW: Record<string, ImageQuality[]> = {
  low: [],
  medium: ["LOW"],
  high: ["LOW", "MEDIUM"],
};

/**
 * Rows this target would actually improve.
 *
 * A null `imageQuality` is a row generated before the column existed,
 * which means the first pass, which means `LOW` — so it is swept up
 * wherever `LOW` is. Prisma will not take null inside `in`, hence the
 * explicit OR rather than a list with a hole in it.
 */
function worseThan(target: string) {
  const below = BELOW[target] ?? [];
  return below.includes("LOW")
    ? { OR: [{ imageQuality: { in: below } }, { imageQuality: null }] }
    : { imageQuality: { in: below } };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Served straight from `public/`, so the path is also the public URL. */
const OUT_DIR = path.join("public", "generated");

/* Providers rate-limit aggressively on image endpoints, and a 429 storm
   costs more wall-clock than pacing does. A new OpenAI organisation is
   capped at five images a minute, so 1.2s — the figure this started with
   — is an order of magnitude too fast and aborted a full run after 63
   products. `fetchRetryingRateLimits` now absorbs the overshoot, but
   pacing under the ceiling is cheaper than being told off and waiting.
   `--delay` raises or lowers it as the account's tier changes. */
const DELAY_MS = Number(arg("delay")) || 12_500;
const MAX_FAILURES = 10;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const regenerate = process.argv.includes("--regenerate");
  const limit = Number(arg("limit")) || undefined;
  const category = arg("category");

  const quality = (arg("quality") ?? "low") as "low" | "medium" | "high";
  if (!["low", "medium", "high"].includes(quality)) {
    throw new Error(`--quality must be low, medium or high, not "${quality}"`);
  }

  /* Square, because a catalogue tile is square — `ProductCard` and the PDP
     gallery both reserve 1/1. `low` is what this job has always asked
     OpenAI for; these are 400px tiles. */
  const generator: ImageGenerator = dryRun
    ? new DryRunGenerator()
    : liveGenerator({
        size: "1024x1024",
        aspectRatio: "1:1",
        quality,
        /* Square at `low` is OpenAI's cheapest tier and Gemini's ordinary
           one: $0.011 against $0.067 an image, which over this catalogue
           is the difference between a $15 run and a $92 one. */
        cheapest: "openai",
        openaiModel: arg("openai-model") ?? "gpt-image-1",
        preferred: arg("provider"),
        geminiModel: arg("gemini-model"),
      });

  const products = await db.product.findMany({
    where: {
      isActive: true,
      /* Regeneration selects rows generated at a quality below the one
         asked for, so a pass skips what it has already upgraded and a
         second run continues rather than starting again. This used to key
         off the stored path, which worked within a run and broke across
         an upload — uploading rewrites rows back to a bucket URL, putting
         every finished product back in scope to be bought again. */
      ...(regenerate
        ? { imageIsGenerated: true, NOT: { image: "" }, ...worseThan(quality) }
        : { image: "" }),
      ...(category ? { category: { slug: category } } : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      pricingUnit: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: limit,
  });

  console.info(
    `${products.length} product(s) ${regenerate ? "to REGENERATE" : "without an image"}` +
      ` · provider: ${generator.name} · quality: ${quality}`,
  );
  if (products.length === 0) return;

  if (!dryRun) await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  let failed = 0;

  for (const [i, product] of products.entries()) {
    const prompt = buildPrompt({
      name: product.name,
      brand: product.brand?.name ?? null,
      category: product.category?.name ?? null,
      pricingUnit: product.pricingUnit,
    });

    console.info(`[${i + 1}/${products.length}] ${product.name}`);

    try {
      const image = await generator.generate(prompt);

      if (!dryRun) {
        /* Named by SKU rather than by slug: a slug can be regenerated,
           and an orphaned image file is harder to spot than a stale one. */
        const file = `${product.sku}.webp`;
        /* Re-encoded rather than stored as returned. Every provider hands
           back PNG, and 1,300 of those is 1.2GB — more than a deploy will
           carry, and more than a phone should download for one tile. The
           same picture as WebP is a fiftieth of that on a plain studio
           background. `generate-studio-images.ts` has always done this;
           this job did not, and the backfill is
           `scripts/webp-generated-images.ts`. */
        const encoded = await sharp(image.data).webp({ quality: 82 }).toBuffer();
        await writeFile(path.join(OUT_DIR, file), encoded);

        await db.product.update({
          where: { id: product.id },
          data: {
            image: `/generated/${file}`,
            imageIsGenerated: true,
            /* Recorded as it is written, so the next pass can tell an
               upgraded row from an original one. Nothing downstream has
               to infer it from a file timestamp. */
            imageQuality: quality.toUpperCase() as ImageQuality,
          },
        });
      }
      written++;
    } catch (error) {
      failed++;
      console.error(`  failed: ${(error as Error).message}`);

      /* A run that keeps failing is failing for a reason that will not
         fix itself — a bad key, an exhausted quota, a changed endpoint —
         and burning through 800 products to discover that is expensive. */
      if (failed >= MAX_FAILURES) {
        console.error(`\nStopping: ${MAX_FAILURES} consecutive-ish failures.`);
        break;
      }
    }

    if (!dryRun && i < products.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.info(`\n${dryRun ? "would write" : "wrote"} ${written}, failed ${failed}`);
  if (dryRun) console.info("dry run — no provider called, nothing written");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
