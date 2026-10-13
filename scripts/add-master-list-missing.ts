/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { firstFreeSlug } from "../src/lib/catalogue-slug";
import { PRODUCT_SLUG_MAX_LENGTH } from "../src/lib/types/catalog";

/**
 * Add the master-list products the catalogue never had.
 *
 *   npx tsx scripts/add-master-list-missing.ts          # report only
 *   npx tsx scripts/add-master-list-missing.ts --fix    # ...and create
 *
 * `restrict-to-master-list.ts` cut the shelf to the owner's own list and
 * reported thirteen of its references as resolving to nothing: twelve
 * Impact wiring accessories and one Asian Paints primer that no import
 * had ever produced. The priced version of that spreadsheet is what
 * makes them creatable — a product without a price is not a product this
 * catalogue can hold, since `ProductVariant.pricePaise` has no sensible
 * default and a zero would be a listing that sells for nothing.
 *
 * ## Created off the shelf
 *
 * `isActive: false`, every one. None has a photograph, and the rule the
 * owner set stands: a product with no picture stays in the database and
 * off the storefront (`reports/deactivated-no-image.json`). Creating
 * them visible would put thirteen blank cards among 510 photographed
 * ones. They are one `UPDATE` from being live the moment there are
 * pictures.
 *
 * ## Shaped exactly like an imported row
 *
 * Same `shared` fields the importer writes, the same single `-STD`
 * variant at `mrpPaise == pricePaise`, and the same slug derivation
 * through `firstFreeSlug` — a product created here must be
 * indistinguishable from one created by `npm run db:import`, or the next
 * import will produce a second copy of it beside this one.
 *
 * GST at 18%, `PER_PIECE`, `SCHEDULED`: not defaults chosen here but
 * what every one of the 220 products already in `electricals-lighting`
 * and all 42 in `paints-finishes` carry. A switch is not a different tax
 * slab for having arrived by a different route.
 *
 * The manufacturer's model code goes in `description`, because that is
 * the one piece of information here a *customer* wants: Impact plates
 * are ordered by code, and `IW501WHI` is what is printed on the box. It
 * is not provenance — `sourceName` carries that, and nothing in the
 * `source*` block is ever rendered.
 *
 * Idempotent on `Product.sku`: a row that already exists is reported and
 * skipped, so running this twice creates nothing twice.
 */
const db = new PrismaClient();

const DATA = path.join("scripts", "data", "master-catalogue-additions.json");

interface Addition {
  ref: string;
  name: string;
  brand: string;
  model: string;
  categorySlug: string;
  pricePaise: number;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const { source, products }: { source: string; products: Addition[] } = JSON.parse(
    await readFile(DATA, "utf8"),
  );

  const existing = await db.product.findMany({
    where: { sku: { in: products.map((p) => p.ref) } },
    select: { sku: true },
  });
  const already = new Set(existing.map((p) => p.sku));
  const todo = products.filter((p) => !already.has(p.ref));

  /* Every slug in the catalogue, read once. `firstFreeSlug` reads the set
     and never adds to it, so each result has to be recorded here or two
     of these thirteen could be handed the same slug. */
  const taken = new Set((await db.product.findMany({ select: { slug: true } })).map((p) => p.slug));

  const categorySlugs = [...new Set(products.map((p) => p.categorySlug))];
  const categories = await db.category.findMany({
    where: { slug: { in: categorySlugs } },
    select: { id: true, slug: true, name: true },
  });
  const categoryId = new Map(categories.map((c) => [c.slug, c.id]));
  const missingCategory = categorySlugs.filter((s) => !categoryId.has(s));
  if (missingCategory.length > 0) {
    throw new Error(`No such category: ${missingCategory.join(", ")}. Nothing was created.`);
  }

  console.log(`source   ${source}`);
  console.log(`to add   ${todo.length}${already.size ? ` (${already.size} already in the catalogue, skipped)` : ""}`);

  const plan: { addition: Addition; slug: string }[] = [];
  for (const addition of todo) {
    const slug = firstFreeSlug(
      `${addition.brand} ${addition.name} ${addition.ref}`,
      PRODUCT_SLUG_MAX_LENGTH,
      taken,
    );
    taken.add(slug);
    plan.push({ addition, slug });
    console.log(
      `  ${addition.ref.padEnd(9)} ${addition.brand.padEnd(13)} ${`₹${(addition.pricePaise / 100).toFixed(2)}`.padStart(10)}  ${addition.categorySlug.padEnd(21)} /p/${slug}`,
    );
  }

  if (!fix) {
    console.log("\nReport only. Re-run with --fix to create these, inactive.");
    return;
  }

  /* Brands are created on demand exactly as `getBrandId` does in the
     importer — "Impact" is a real brand the catalogue has simply never
     carried a row for. */
  const brandId = new Map<string, string>();
  const brandSlugs = new Set((await db.brand.findMany({ select: { slug: true } })).map((b) => b.slug));
  for (const name of new Set(plan.map((p) => p.addition.brand))) {
    const found = await db.brand.findUnique({ where: { name } });
    if (found) {
      brandId.set(name, found.id);
      continue;
    }
    const slug = firstFreeSlug(name, 140, brandSlugs);
    brandSlugs.add(slug);
    const created = await db.brand.create({ data: { name, slug } });
    brandId.set(name, created.id);
    console.log(`created brand ${name} (${slug})`);
  }

  let made = 0;
  for (const { addition, slug } of plan) {
    await db.product.create({
      data: {
        sku: addition.ref,
        slug,
        name: addition.name,
        brandId: brandId.get(addition.brand) ?? null,
        categoryId: categoryId.get(addition.categorySlug)!,
        description: addition.model ? `${addition.brand} model ${addition.model}.` : "",
        pricingUnit: "PER_PIECE",
        fulfilment: "SCHEDULED",
        gstRatePct: 18,
        /* Quoin's own image stays empty, and that is why `isActive` is
           false below — the same pairing the importer leaves behind. */
        image: "",
        isActive: false,
        sourceName: "Owner master catalogue with prices, 13 Oct 2026",
        sourcePricePaise: addition.pricePaise,
        variants: {
          create: {
            sku: `${addition.ref}-STD`,
            label: "Standard",
            /* No discount invented: one price in, one price out. */
            mrpPaise: addition.pricePaise,
            pricePaise: addition.pricePaise,
            minQty: 1,
            stepQty: 1,
            isDefault: true,
          },
        },
      },
    });
    made++;
  }

  const active = await db.product.count({ where: { isActive: true } });
  console.log(`\ncreated ${made} products, all inactive; ${active} still active`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
