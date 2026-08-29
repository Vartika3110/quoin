/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { Fulfilment, PricingUnit, PrismaClient } from "@prisma/client";

/**
 * Import a manufacturer's own catalogue.
 *
 * The competitor scrapes gave re-listings keyed by a reseller's internal
 * code, with no photography Quoin may show. A dealer catalogue gives the
 * manufacturer's real code, its current price, a written description and
 * an image — so for the brands where one exists, this is the better
 * source and it supersedes the scraped rows.
 *
 * Reads the manifest produced by research/extract-brand-catalogue.py.
 *
 *   npm run db:import-brand -- research/data/catalogues/jaquar --dry-run
 *   npm run db:import-brand -- research/data/catalogues/jaquar
 */
const db = new PrismaClient();

interface Record {
  code: string;
  description: string | null;
  pricePaise: number | null;
  page: number;
  image: string | null;
}

/** Where the storefront serves them from; the path is also the URL. */
const PUBLIC_DIR = path.join("public", "catalogue");

/**
 * Per-brand facts the PDF does not carry.
 *
 * A bath catalogue is bathware — the category is a property of the
 * catalogue, not of each row, and guessing it per product from a
 * description would be worse than stating it once here.
 */
const BRAND_DEFAULTS: Record_<string, { brand: string; category: string; gstRatePct: number }> = {
  jaquar: { brand: "Jaquar", category: "Bathware & plumbing", gstRatePct: 18 },
};
type Record_<K extends string, V> = { [key in K]: V };

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

function uniqueSlug(base: string, maxLength: number, taken: Set<string>): string {
  const root = slugify(base).slice(0, maxLength);
  let candidate = root;
  let n = 1;
  while (taken.has(candidate)) {
    n += 1;
    const suffix = `-${n}`;
    candidate = `${root.slice(0, maxLength - suffix.length)}${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) throw new Error("usage: db:import-brand -- <manifest-dir> [--dry-run]");

  const key = path.basename(dir);
  const defaults = BRAND_DEFAULTS[key];
  if (!defaults) throw new Error(`no brand defaults for '${key}'`);

  const manifest = JSON.parse(
    await readFile(path.join(dir, `${key}-catalogue.json`), "utf8"),
  ) as { products: Record[] };

  /* A row without a price cannot be sold, whatever else it carries. The
     image is optional — the storefront falls back to a swatch. */
  const sellable = manifest.products.filter((p) => p.pricePaise && p.description);

  console.info(
    `${manifest.products.length} in manifest · ${sellable.length} priced and described`,
  );

  if (dryRun) {
    for (const p of sellable.slice(0, 5)) {
      console.info(`  ${p.code}  ₹${(p.pricePaise! / 100).toLocaleString("en-IN")}  ${p.description}`);
    }
    console.info("dry run — nothing written");
    return;
  }

  const outDir = path.join(PUBLIC_DIR, key);
  await mkdir(outDir, { recursive: true });

  const brand =
    (await db.brand.findFirst({ where: { name: defaults.brand } })) ??
    (await db.brand.create({
      data: { name: defaults.brand, slug: slugify(defaults.brand) },
    }));

  const category =
    (await db.category.findFirst({ where: { name: defaults.category } })) ??
    (await db.category.create({
      data: { name: defaults.category, slug: slugify(defaults.category) },
    }));

  const slugs = new Set(
    (await db.product.findMany({ select: { slug: true } })).map((p) => p.slug),
  );

  let created = 0;
  let updated = 0;
  let withImage = 0;

  for (const row of sellable) {
    let imageUrl = "";
    if (row.image) {
      const source = path.join(dir, "images", row.image);
      if (existsSync(source)) {
        await copyFile(source, path.join(outDir, row.image));
        imageUrl = `/catalogue/${key}/${row.image}`;
        withImage++;
      }
    }

    const shared = {
      name: row.description!,
      brandId: brand.id,
      categoryId: category.id,
      pricingUnit: PricingUnit.PER_PIECE,
      /* Conservative, as with the competitor import: nothing is INSTANT
         until a dark store actually holds it. */
      fulfilment: Fulfilment.SCHEDULED,
      gstRatePct: defaults.gstRatePct,
      image: imageUrl,
      imageIsGenerated: false,
      sourceName: `${defaults.brand} catalogue`,
    };

    const existing = await db.product.findUnique({ where: { sku: row.code } });

    const product = existing
      ? await db.product.update({ where: { sku: row.code }, data: shared })
      : await db.product.create({
          data: {
            ...shared,
            sku: row.code,
            slug: uniqueSlug(`${defaults.brand} ${row.description} ${row.code}`, 280, slugs),
          },
        });

    /* The catalogue price is the MRP. Sell price starts equal to it;
       margin is a merchandising decision, not something to invent here. */
    await db.productVariant.upsert({
      where: { sku: `${row.code}-STD` },
      update: { mrpPaise: row.pricePaise!, pricePaise: row.pricePaise! },
      create: {
        sku: `${row.code}-STD`,
        productId: product.id,
        label: "Standard",
        mrpPaise: row.pricePaise!,
        pricePaise: row.pricePaise!,
        minQty: 1,
        stepQty: 1,
        isDefault: true,
      },
    });

    if (existing) updated++;
    else created++;
  }

  console.info(`created ${created}, updated ${updated}, images copied ${withImage}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
