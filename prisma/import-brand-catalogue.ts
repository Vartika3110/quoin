/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
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
  "jaquar-technical": { brand: "Jaquar", category: "Bathware & plumbing", gstRatePct: 18 },
};

/**
 * The same product is coded differently in different Jaquar catalogues:
 * the price list carries the finish (`ARI-CHR-39441K`), the technical
 * catalogue leaves it out (`ARI-39441K`). Dropping the middle segment of
 * a three-part code puts both into one form so they can be reconciled.
 */
function withoutFinish(code: string): string {
  const parts = code.split("-");
  return parts.length === 3 ? `${parts[0]}-${parts[2]}` : code;
}
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
  /* For specification catalogues, whose cells are full of dimension text
     from the drawings beside them. Their descriptions make poor product
     names, but their photographs are the same photographs. */
  const imagesOnly = args.includes("--images-only");
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) throw new Error("usage: db:import-brand -- <manifest-dir> [--dry-run]");

  const found = (await readdir(dir)).find((f) => f.endsWith("-catalogue.json"));
  if (!found) throw new Error(`no *-catalogue.json in ${dir}`);

  const manifest = JSON.parse(await readFile(path.join(dir, found), "utf8")) as {
    brand: string;
    products: Record[];
  };

  const defaults = BRAND_DEFAULTS[manifest.brand];
  if (!defaults) throw new Error(`no brand defaults for '${manifest.brand}'`);
  const key = manifest.brand;

  /* A description is the minimum — a row with neither a name nor a price
     is a page artefact, not a product. Price is optional: several
     manufacturer catalogues are specification documents that carry codes
     and photography but no price list, and those are still worth having.
     What such a row does not get is a variant, and the storefront only
     shows products that have one, so an unpriced product is in the
     database to be priced and invisible until it is. */
  const usable = manifest.products.filter((p) => p.description);
  const priced = usable.filter((p) => p.pricePaise);

  console.info(
    `${manifest.products.length} in manifest · ${usable.length} described · ${priced.length} priced`,
  );

  if (dryRun) {
    for (const p of usable.slice(0, 5)) {
      const money = p.pricePaise
        ? `₹${(p.pricePaise / 100).toLocaleString("en-IN")}`
        : "unpriced";
      console.info(`  ${p.code}  ${money}  ${p.description}`);
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

  /* Existing products keyed by their finish-stripped code, so a technical
     code can find the priced row it belongs to. Codes that collapse onto
     the same form are dropped rather than guessed at: several finishes of
     one fitting share a shape, and hanging the chrome photograph on the
     black-matt SKU would show the customer the wrong product. */
  const byStripped = new Map<string, string | null>();
  for (const p of await db.product.findMany({
    where: { brandId: brand.id },
    select: { id: true, sku: true },
  })) {
    const key_ = withoutFinish(p.sku);
    byStripped.set(key_, byStripped.has(key_) ? null : p.id);
  }

  let created = 0;
  let updated = 0;
  let withImage = 0;
  let imagesAdded = 0;
  let awaitingPrice = 0;
  let reconciled = 0;
  let unmatched = 0;

  for (const row of usable) {
    let existing = await db.product.findUnique({ where: { sku: row.code } });

    /* Not found by its own code — try the other catalogue's spelling. */
    if (!existing) {
      const id = byStripped.get(withoutFinish(row.code));
      if (id) {
        existing = await db.product.findUnique({ where: { id } });
        if (existing) reconciled++;
      }
    }

    if (!existing && imagesOnly) {
      unmatched++;
      continue;
    }

    /* Only copy an image that will actually be used. A second catalogue
       for the same brand writes to the same directory, and overwriting a
       photograph already in use with whatever this one happens to carry
       is a silent downgrade. */
    let imageUrl = "";
    if (row.image && !existing?.image) {
      const source = path.join(dir, "images", row.image);
      if (existsSync(source)) {
        await copyFile(source, path.join(outDir, row.image));
        imageUrl = `/catalogue/${key}/${row.image}`;
        withImage++;
      }
    }

    let product;
    if (existing) {
      /* A specification catalogue must not overwrite what a price
         catalogue already established. It contributes the photograph it
         has and nothing else — the description here is often terser, and
         replacing a good name with a worse one is not an improvement. */
      const patch = imageUrl && !existing.image ? { image: imageUrl, imageIsGenerated: false } : {};
      /* By id, not by `row.code`: a row reconciled through the
         finish-stripped form belongs to a product whose SKU is the other
         catalogue's spelling, and updating by this catalogue's code
         would look for a record that does not exist. */
      product = Object.keys(patch).length
        ? await db.product.update({ where: { id: existing.id }, data: patch })
        : existing;
      if (Object.keys(patch).length) imagesAdded++;
      updated++;
    } else {
      product = await db.product.create({
        data: {
          name: row.description!,
          brandId: brand.id,
          categoryId: category.id,
          pricingUnit: PricingUnit.PER_PIECE,
          /* Conservative, as with the competitor import: nothing is
             INSTANT until a dark store actually holds it. */
          fulfilment: Fulfilment.SCHEDULED,
          gstRatePct: defaults.gstRatePct,
          image: imageUrl,
          imageIsGenerated: false,
          sourceName: `${defaults.brand} catalogue`,
          sku: row.code,
          slug: uniqueSlug(`${defaults.brand} ${row.description} ${row.code}`, 280, slugs),
        },
      });
      created++;
    }

    if (row.pricePaise) {
      /* The catalogue price is the MRP. Sell price starts equal to it;
         margin is a merchandising decision, not something to invent. */
      await db.productVariant.upsert({
        where: { sku: `${row.code}-STD` },
        update: { mrpPaise: row.pricePaise, pricePaise: row.pricePaise },
        create: {
          sku: `${row.code}-STD`,
          productId: product.id,
          label: "Standard",
          mrpPaise: row.pricePaise,
          pricePaise: row.pricePaise,
          minQty: 1,
          stepQty: 1,
          isDefault: true,
        },
      });
    } else {
      awaitingPrice++;
    }
  }

  console.info(
    `created ${created}, updated ${updated}, images copied ${withImage}` +
      (imagesAdded ? `, photographs added to existing products ${imagesAdded}` : ""),
  );
  if (reconciled) {
    console.info(`${reconciled} matched an existing product by finish-stripped code`);
  }
  if (unmatched) {
    console.info(`${unmatched} skipped: no existing product, and --images-only was set`);
  }
  if (awaitingPrice) {
    console.info(
      `${awaitingPrice} product(s) have no price and therefore no variant — ` +
        "they are in the database and hidden from the storefront until priced.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
