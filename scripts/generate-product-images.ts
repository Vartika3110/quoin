/**
 * Generate a catalogue image for every product that lacks one.
 *
 *   npx tsx scripts/generate-product-images.ts --dry-run
 *   npx tsx scripts/generate-product-images.ts --limit 20
 *   npx tsx scripts/generate-product-images.ts --category paints-finishes
 *   npx tsx scripts/generate-product-images.ts
 *
 * Resumable by construction: it only selects products whose `image` is
 * still empty, so an interrupted run is continued by running it again.
 * Nothing is ever regenerated, because every regeneration is money.
 *
 * Everything written here is flagged `imageIsGenerated`, and the
 * storefront labels those as illustrations. See src/lib/images/generator.ts.
 */
/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  DryRunGenerator,
  OpenAiImageGenerator,
  buildPrompt,
  type ImageGenerator,
} from "../src/lib/images/generator";

const db = new PrismaClient();

/** Served straight from `public/`, so the path is also the public URL. */
const OUT_DIR = path.join("public", "generated");

/* Providers rate-limit aggressively on image endpoints, and a 429 storm
   costs more wall-clock than pacing does. */
const DELAY_MS = 1200;
const MAX_FAILURES = 10;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = Number(arg("limit")) || undefined;
  const category = arg("category");

  const generator: ImageGenerator = dryRun
    ? new DryRunGenerator()
    : new OpenAiImageGenerator(process.env.OPENAI_API_KEY ?? "");

  const products = await db.product.findMany({
    where: {
      isActive: true,
      image: "",
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
    `${products.length} product(s) without an image · provider: ${generator.name}`,
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
        const file = `${product.sku}.${image.extension}`;
        await writeFile(path.join(OUT_DIR, file), image.data);

        await db.product.update({
          where: { id: product.id },
          data: { image: `/generated/${file}`, imageIsGenerated: true },
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
