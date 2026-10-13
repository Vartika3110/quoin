/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Put the real product photographs on the shelf.
 *
 *   npx tsx scripts/use-supplier-photographs.ts          # report only
 *   npx tsx scripts/use-supplier-photographs.ts --fix    # ...and apply
 *
 * Every product on the owner's master list currently shows a generated
 * illustration, labelled "Illustration — actual product may vary"
 * because that is what it is. Meanwhile 444 of those same products have
 * a genuine supplier photograph sitting in `public/catalogue/imported/`,
 * downloaded by `localise-source-images.ts` and committed to this
 * repository, shown to nobody: a Dr. Fixit tin, an Ashirvad elbow, the
 * actual Ambuja bag rather than a drawing of a sack.
 *
 * This points `Product.image` at them.
 *
 * ## What this decides, and what it does not
 *
 * It is a **rights decision**, and it is the owner's: these are supplier
 * and manufacturer photographs, and the master-list spreadsheet's own
 * "Image Rights Audit" sheet is right that finding an image and being
 * allowed to publish it are two different things. Nothing here
 * establishes permission. It was asked for explicitly.
 *
 * What it is not is a change of honesty in the storefront.
 * `imageIsGenerated` goes to **false** for every row touched, which is
 * what removes the illustration label — and that label must come off,
 * because leaving "actual product may vary" under a real photograph of
 * the actual product is its own small lie.
 *
 * `imageQuality` is cleared. The field means "what `image` was generated
 * at, when it was generated here" (see the schema), so on a photograph
 * nobody generated it has no meaning, and a stale `LOW` would tell a
 * future regeneration pass to come back and overwrite a real picture.
 *
 * ## A side effect worth having
 *
 * These paths are served by the app itself out of `public/`, where every
 * current image is a Supabase Storage URL. Storage is presently refusing
 * requests — `exceed_egress_quota` — so the 444 products this touches
 * are also the only ones whose pictures will load until that is lifted.
 *
 * ## Products that come back on the shelf
 *
 * Nine master-list products are inactive for having no photograph
 * (`reports/deactivated-no-image.json`). All nine have one here, so the
 * reason is gone and they are reactivated — but only those nine, and
 * only because they are on the list and now have a picture. Nothing else
 * inactive is touched.
 */
const db = new PrismaClient();

const PHOTO_DIR = path.join("public", "catalogue", "imported");
const LIST = path.join("scripts", "data", "master-catalogue.json");
const REPORT = path.join("reports", "supplier-photographs-applied.json");

/** The extensions `localise-source-images.ts` writes, most likely first. */
const EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

function photoFor(sku: string): string | null {
  for (const ext of EXTENSIONS) {
    if (existsSync(path.join(PHOTO_DIR, `${sku}.${ext}`))) {
      /* A URL path, not a filesystem path: this is what goes in `src`. */
      return `/catalogue/imported/${sku}.${ext}`;
    }
  }
  return null;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const refs: string[] = JSON.parse(await readFile(LIST, "utf8")).products.map(
    (p: { ref: string }) => p.ref,
  );

  const products = await db.product.findMany({
    where: { sku: { in: refs } },
    select: {
      sku: true,
      name: true,
      isActive: true,
      image: true,
      imageIsGenerated: true,
      imageQuality: true,
    },
    orderBy: { sku: "asc" },
  });

  const withPhoto = products
    .map((p) => ({ product: p, photo: photoFor(p.sku) }))
    .filter((row): row is { product: (typeof products)[number]; photo: string } => row.photo !== null);

  const toReactivate = withPhoto.filter((r) => !r.product.isActive);
  const alreadyThere = withPhoto.filter((r) => r.product.image === r.photo).length;

  console.log(`master list in the catalogue   ${products.length}`);
  console.log(`  a supplier photograph here   ${withPhoto.length}`);
  console.log(`  no photograph                ${products.length - withPhoto.length}  (keeping what they have)`);
  console.log(`  already pointed at it        ${alreadyThere}`);
  console.log(`  hidden, and now need not be  ${toReactivate.length}`);
  for (const r of toReactivate) {
    console.log(`     ${r.product.sku.padEnd(16)} ${r.product.name.slice(0, 46)}`);
  }

  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(
    REPORT,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        applied: fix,
        /* The undo record: each row's image and flags exactly as they
           were, so a change of mind is a restore rather than a rebuild. */
        before: withPhoto.map((r) => ({
          sku: r.product.sku,
          image: r.product.image,
          imageIsGenerated: r.product.imageIsGenerated,
          imageQuality: r.product.imageQuality,
          isActive: r.product.isActive,
          photographUsed: r.photo,
        })),
      },
      null,
      1,
    )}\n`,
  );
  console.log(`\nreport → ${REPORT}`);

  if (!fix) {
    console.log("\nReport only. Re-run with --fix to apply.");
    return;
  }

  let updated = 0;
  for (const { product, photo } of withPhoto) {
    await db.product.update({
      where: { sku: product.sku },
      data: {
        image: photo,
        /* The illustration label comes off with the illustration. */
        imageIsGenerated: false,
        imageQuality: null,
        ...(product.isActive ? {} : { isActive: true }),
      },
    });
    updated++;
  }

  const active = await db.product.count({ where: { isActive: true } });
  console.log(`\n${updated} products now show a photograph; ${active} active`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
