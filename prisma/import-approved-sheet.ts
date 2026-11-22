/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { Fulfilment, PricingUnit, PrismaClient } from "@prisma/client";

import { firstFreeSlug, slugifyProduct } from "../src/lib/catalogue-slug";
import { PRODUCT_SLUG_MAX_LENGTH } from "../src/lib/types/catalog";

/**
 * Put the rows a human approved in the spreadsheet on the website.
 *
 * The last step of the PDF pipeline: `research/extract-catalogue-sheet.py`
 * proposes products out of a supplier's catalogue,
 * `research/read-approved-sheet.py` reads back which of them were
 * highlighted and priced, and this writes those — and only those — into
 * the catalogue as live products.
 *
 *   npm run db:import-sheet -- approved.json --dry-run
 *   npm run db:import-sheet -- approved.json
 *
 * What it will not do, because each of these is somebody's decision and
 * not an import's:
 *
 * - **Invent a price.** A row whose `pricePaise` is missing never
 *   reaches this file; the reader declines it by name.
 * - **Invent a category.** A category that is not already in the
 *   storefront's navigation is refused rather than created, because the
 *   dropdown offered the real ones and a new one is a typo.
 * - **Claim stock or speed.** Everything arrives `SCHEDULED` with
 *   `stockTracked` left alone — an eighteen-minute promise is a fact
 *   about a dark store, which a PDF does not carry.
 * - **Overwrite a photograph** that is already on a product, unless
 *   `--replace-images` says so. Re-running an import must not quietly
 *   downgrade a real photograph to a catalogue crop.
 *
 * Idempotent: products are matched on their code (`sku`) and updated in
 * place, and a slug is assigned on creation only, so re-importing a
 * corrected sheet never changes a URL that has been indexed.
 */
const db = new PrismaClient();

interface ApprovedRow {
  brand: string;
  name: string;
  code: string;
  series: string;
  variant: string;
  category: string;
  unit: string;
  gstRatePct: number | null;
  cataloguePricePaise: number | null;
  pricePaise: number;
  image: string;
  page: number | null;
  sheetRow: number;
}

/** Where the storefront serves catalogue photography from; path is URL. */
const PUBLIC_DIR = path.join("public", "catalogue");

/** The spreadsheet's wording, and the schema's. */
const UNITS: Record<string, PricingUnit> = {
  "per piece": PricingUnit.PER_PIECE,
  "per sqft": PricingUnit.PER_SQFT,
  "per running ft": PricingUnit.PER_RUNNING_FT,
  "per bag": PricingUnit.PER_BAG,
  "per litre": PricingUnit.PER_LITRE,
  "per kg": PricingUnit.PER_KG,
  "per visit": PricingUnit.PER_VISIT,
};

/** The slabs an invoice line may legally carry. */
const GST_SLABS = new Set([0, 5, 12, 18, 28]);

/** Paise as rupees, with paise shown only when there are any. */
function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function has(flag: string): boolean {
  return process.argv.includes(`--${flag}`);
}

/** Records each slug it hands out; see the note in import-catalogue.ts. */
function uniqueSlug(base: string, taken: Set<string>): string {
  const slug = firstFreeSlug(base, PRODUCT_SLUG_MAX_LENGTH, taken);
  taken.add(slug);
  return slug;
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

async function main() {
  const dryRun = has("dry-run");
  const replaceImages = has("replace-images");
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) {
    throw new Error("usage: db:import-sheet -- <approved.json> [--dry-run]");
  }

  const payload = JSON.parse(await readFile(file, "utf8")) as {
    imagesDir: string;
    approved: ApprovedRow[];
    declined?: { sheet: string; row: number; reason: string }[];
  };

  const rows = payload.approved ?? [];
  if (!rows.length) {
    console.info("nothing approved in that file — no rows were highlighted");
    return;
  }

  /* Categories are matched, never created: the dropdown in the sheet
     offered the storefront's own, so anything else is a typo, and a typo
     that becomes a category is a navigation node with one product in it
     that nobody will ever find. */
  const categories = await db.category.findMany({
    select: { id: true, name: true, slug: true },
  });
  const categoryBy = new Map<string, string>();
  for (const category of categories) {
    categoryBy.set(key(category.name), category.id);
    categoryBy.set(key(category.slug), category.id);
  }

  const brands = await db.brand.findMany({ select: { id: true, name: true } });
  const brandBy = new Map(brands.map((b) => [key(b.name), b.id]));

  const slugs = new Set(
    (await db.product.findMany({ select: { slug: true } })).map((p) => p.slug),
  );

  /* One product per code; every row of that code is one of its variants.
     A catalogue lists a range down the page with a size and a price on
     each line, and importing those separately would make one drawer
     system look like six. */
  const grouped = new Map<string, ApprovedRow[]>();
  const problems: string[] = [];

  for (const row of rows) {
    if (row.category && !categoryBy.has(key(row.category))) {
      problems.push(
        `${row.brand} row ${row.sheetRow} (${row.code}): no category called ` +
          `"${row.category}" — pick one from the dropdown`,
      );
      continue;
    }
    if (row.unit && !UNITS[key(row.unit)]) {
      problems.push(
        `${row.brand} row ${row.sheetRow} (${row.code}): unknown unit ` +
          `"${row.unit}" — one of ${Object.keys(UNITS).join(", ")}`,
      );
      continue;
    }
    grouped.set(`${key(row.brand)}::${row.code}`, [
      ...(grouped.get(`${key(row.brand)}::${row.code}`) ?? []),
      row,
    ]);
  }

  const uncategorised = rows.filter((r) => !r.category).length;
  const newBrands = [
    ...new Set(rows.map((r) => r.brand).filter((b) => !brandBy.has(key(b)))),
  ];

  console.info(
    `${rows.length} approved row(s) · ${grouped.size} product(s) · ` +
      `${payload.declined?.length ?? 0} declined by the reader`,
  );
  if (newBrands.length) {
    console.info(`new brand(s) to be created: ${newBrands.join(", ")}`);
  }
  if (uncategorised) {
    console.info(
      `${uncategorised} row(s) have no category — they will be sellable and ` +
        "searchable but will not appear under any category in browse",
    );
  }
  for (const problem of problems) console.info(`SKIPPED ${problem}`);

  if (dryRun) {
    for (const [, group] of [...grouped].slice(0, 8)) {
      const row = group[0];
      const mine = rupees(row.pricePaise);
      const mrp = row.cataloguePricePaise
        ? `, MRP ${rupees(row.cataloguePricePaise)}`
        : "";
      console.info(
        `  ${row.brand} ${row.code}  ${mine}${mrp}  ${row.name.slice(0, 48)}` +
          (group.length > 1 ? `  (${group.length} variants)` : ""),
      );
    }
    console.info("dry run — nothing written");
    return;
  }

  let created = 0;
  let updated = 0;
  let variantsWritten = 0;
  let imagesCopied = 0;
  let imagesKept = 0;
  let aboveMrp = 0;

  for (const [, group] of grouped) {
    const row = group[0];

    let brandId = brandBy.get(key(row.brand));
    if (!brandId) {
      const brand = await db.brand.create({
        data: { name: row.brand.trim(), slug: slugifyProduct(row.brand) },
      });
      brandId = brand.id;
      brandBy.set(key(row.brand), brand.id);
    }

    const categoryId = row.category ? categoryBy.get(key(row.category)) : undefined;
    const brandSlug = slugifyProduct(row.brand);

    const existing = await db.product.findUnique({ where: { sku: row.code } });

    /* Only copy a picture that is going to be used. Overwriting a
       photograph already on a product with a crop out of a PDF is a
       silent downgrade, so it takes --replace-images to say so. */
    let imageUrl = "";
    if (row.image && (!existing?.image || replaceImages)) {
      const source = path.join(payload.imagesDir, row.image);
      if (existsSync(source)) {
        const dir = path.join(PUBLIC_DIR, brandSlug);
        await mkdir(dir, { recursive: true });
        await copyFile(source, path.join(dir, row.image));
        imageUrl = `/catalogue/${brandSlug}/${row.image}`;
        imagesCopied++;
      }
    } else if (existing?.image && row.image) {
      imagesKept++;
    }

    const gst =
      row.gstRatePct !== null && GST_SLABS.has(row.gstRatePct)
        ? row.gstRatePct
        : 18;

    const shared = {
      name: row.name,
      brandId,
      categoryId: categoryId ?? null,
      pricingUnit: UNITS[key(row.unit)] ?? PricingUnit.PER_PIECE,
      gstRatePct: gst,
      isActive: true,
    };

    let product;
    if (existing) {
      product = await db.product.update({
        where: { id: existing.id },
        data: { ...shared, ...(imageUrl ? { image: imageUrl, imageIsGenerated: false } : {}) },
      });
      updated++;
    } else {
      product = await db.product.create({
        data: {
          ...shared,
          sku: row.code,
          slug: uniqueSlug(`${row.brand} ${row.name} ${row.code}`, slugs),
          /* Conservative, as with every other importer: nothing claims a
             dark store holds it, and stock tracking is merchandising's
             to switch on once stock has been counted. */
          fulfilment: Fulfilment.SCHEDULED,
          image: imageUrl,
          imageIsGenerated: false,
          sourceName: `${row.brand} catalogue`,
        },
      });
      created++;
    }

    for (const [index, line] of group.entries()) {
      /* The variant's own identity, not the product's: one code appears
         once per size, and two sizes must not collide on one SKU. */
      const variantSku =
        group.length === 1 ? `${line.code}-STD` : `${line.code}-${index + 1}`;

      /* MRP is what the catalogue printed; the sell price is what the
         sheet decided. Where the catalogue printed nothing, MRP is the
         sell price — a struck-through figure nobody quoted would be an
         invented discount. */
      const mrpPaise = Math.max(
        line.cataloguePricePaise ?? line.pricePaise,
        line.pricePaise,
      );
      if (line.cataloguePricePaise && line.pricePaise > line.cataloguePricePaise) {
        aboveMrp++;
      }

      await db.productVariant.upsert({
        where: { sku: variantSku },
        update: {
          mrpPaise,
          pricePaise: line.pricePaise,
          label: line.variant || "Standard",
          isActive: true,
        },
        create: {
          sku: variantSku,
          productId: product.id,
          label: line.variant || "Standard",
          mrpPaise,
          pricePaise: line.pricePaise,
          minQty: 1,
          stepQty: 1,
          isDefault: index === 0,
        },
      });
      variantsWritten++;
    }
  }

  console.info(
    `\ncreated ${created}, updated ${updated}, ${variantsWritten} variant(s) priced`,
  );
  console.info(
    `${imagesCopied} photograph(s) copied into ${PUBLIC_DIR}` +
      (imagesKept
        ? `, ${imagesKept} left alone on products that already had one ` +
          "(--replace-images overrides)"
        : ""),
  );
  if (aboveMrp) {
    console.info(
      `${aboveMrp} variant(s) are priced above the catalogue's MRP — the MRP ` +
        "was raised to match so the storefront shows no negative discount",
    );
  }
  if (imagesCopied) {
    console.info(
      "public/catalogue is committed to the repo, so commit the new files " +
        "or the deployed site shows a swatch where the photograph should be.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
