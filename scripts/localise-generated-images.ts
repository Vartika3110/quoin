/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Take the last of the shelf off Supabase Storage.
 *
 *   npx tsx scripts/localise-generated-images.ts          # report only
 *   npx tsx scripts/localise-generated-images.ts --fix    # ...and copy
 *
 * Storage is currently refusing requests — `exceed_egress_quota` — and
 * every image it holds is returning an error page instead of a picture.
 * `use-supplier-photographs.ts` moved 444 products onto photographs
 * served out of `public/`, which left exactly 75 active products still
 * pointing at a Storage URL: the ones whose picture is a generated
 * illustration and has no photograph to replace it.
 *
 * Every one of those 75 was generated on this machine and still exists
 * under `public/generated/`, which is 1.5GB and git-ignored for the
 * obvious reason. The 75 the shop actually needs are 17KB each and 1.3MB
 * together. Copying those into `public/catalogue/illustrated/`, which is
 * tracked, is the whole fix: the storefront then serves every picture it
 * shows from the app itself, and a Storage cap stops being a shop
 * outage. Storage keeps what it is actually for — Studio imagery,
 * customer uploads, parcha scans.
 *
 * This is deliberately not "copy `public/generated`". That directory is
 * every image ever generated, at every quality, for products that have
 * since been deactivated; committing it would put 1.5GB into the
 * repository to serve 1.3MB of it.
 *
 * ## What does not change
 *
 * `imageIsGenerated` stays **true** on all 75. These are still
 * illustrations, the storefront must still say so, and where the picture
 * is served from has nothing to do with whether it is a photograph.
 * `imageQuality` stays too: it describes what this image was generated
 * at, and a regeneration pass still needs to know.
 */
const db = new PrismaClient();

const SOURCE_DIR = path.join("public", "generated");
const DEST_DIR = path.join("public", "catalogue", "illustrated");
const REPORT = path.join("reports", "localised-illustrations.json");

async function main() {
  const fix = process.argv.includes("--fix");

  /* Scoped by what is actually served, not by any list: an active
     product whose image is a Storage URL is, right now, a broken card. */
  const stranded = await db.product.findMany({
    where: { isActive: true, image: { contains: "supabase.co" } },
    select: { sku: true, name: true, image: true, imageIsGenerated: true },
    orderBy: { sku: "asc" },
  });

  const resolved = stranded.map((product) => {
    const source = path.join(SOURCE_DIR, `${product.sku}.webp`);
    return { product, source, exists: existsSync(source) };
  });
  const copyable = resolved.filter((r) => r.exists);
  const orphans = resolved.filter((r) => !r.exists);

  console.log(`active products served from Supabase Storage  ${stranded.length}`);
  console.log(`  a local copy to serve instead               ${copyable.length}`);
  console.log(`  no local copy — left alone                  ${orphans.length}`);
  for (const o of orphans.slice(0, 20)) {
    console.log(`     ${o.product.sku.padEnd(16)} ${o.product.name.slice(0, 46)}`);
  }

  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(
    REPORT,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        applied: fix,
        /* Undo: the Storage URL each row carried before. */
        before: copyable.map((r) => ({ sku: r.product.sku, image: r.product.image })),
        withoutLocalCopy: orphans.map((r) => ({ sku: r.product.sku, image: r.product.image })),
      },
      null,
      1,
    )}\n`,
  );
  console.log(`\nreport → ${REPORT}`);

  if (!fix) {
    console.log("\nReport only. Re-run with --fix to copy and repoint.");
    return;
  }

  await mkdir(DEST_DIR, { recursive: true });
  let done = 0;
  for (const { product, source } of copyable) {
    const file = `${product.sku}.webp`;
    await copyFile(source, path.join(DEST_DIR, file));
    await db.product.update({
      where: { sku: product.sku },
      /* Path only. `imageIsGenerated` is untouched on purpose — see the
         note above: these are still illustrations and still say so. */
      data: { image: `/catalogue/illustrated/${file}` },
    });
    done++;
  }

  const left = await db.product.count({
    where: { isActive: true, image: { contains: "supabase.co" } },
  });
  console.log(`\ncopied and repointed ${done}; ${left} active products still on Storage`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
