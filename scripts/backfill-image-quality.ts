/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

/**
 * Mark the images that were redone at a higher quality than the rest.
 *
 *   npx tsx scripts/backfill-image-quality.ts --dry-run
 *   npx tsx scripts/backfill-image-quality.ts --since 2026-09-30T16:45:00Z --quality MEDIUM
 *
 * The migration set every generated row to `LOW`, which is right for the
 * first catalogue pass. Sixty products were regenerated at `MEDIUM`
 * afterwards, and nothing in the database distinguishes them: an upgraded
 * row and an original one are the same kind of URL in the same bucket.
 * The only trace is the timestamp on the file this machine wrote.
 *
 * So this is a one-off for a gap that existed before `imageQuality` did.
 * Runs after it record their own quality as they write, and nothing needs
 * to infer anything from a filesystem again.
 */
const db = new PrismaClient();

const OUT_DIR = path.join("public", "generated");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  /* The regeneration batch sits after a two-day gap in file timestamps,
     so the boundary is not a guess: 60 files from 16:49:35Z onward, then
     nothing for 2,980 minutes. */
  const since = Date.parse(arg("since") ?? "2026-09-30T16:45:00Z");
  const quality = (arg("quality") ?? "MEDIUM") as "LOW" | "MEDIUM" | "HIGH";

  if (Number.isNaN(since)) throw new Error("--since must be a parsable date");

  const rows = await db.product.findMany({
    where: { imageIsGenerated: true, NOT: { image: "" } },
    select: { id: true, sku: true, imageQuality: true },
  });

  const upgraded = rows.filter((r) => {
    const f = path.join(OUT_DIR, `${r.sku}.webp`);
    return existsSync(f) && statSync(f).mtimeMs > since;
  });

  console.info(`${rows.length} generated row(s)`);
  console.info(`  written after ${new Date(since).toISOString()}: ${upgraded.length}`);
  console.info(`  already marked ${quality}: ${upgraded.filter((u) => u.imageQuality === quality).length}`);

  if (dryRun || upgraded.length === 0) {
    if (dryRun) console.info("\ndry run — nothing changed.");
    return;
  }

  const { count } = await db.product.updateMany({
    where: { id: { in: upgraded.map((u) => u.id) } },
    data: { imageQuality: quality },
  });
  console.info(`\nmarked ${count} row(s) as ${quality}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
