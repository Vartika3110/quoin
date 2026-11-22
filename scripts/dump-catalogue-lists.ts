/**
 * Write the catalogue's own category and brand names to a JSON file.
 *
 *   npx tsx scripts/dump-catalogue-lists.ts research/data/categories.json
 *
 * Read-only. It exists so that the PDF extractor can put a *real*
 * category list in the spreadsheet's dropdown and recognise a brand the
 * catalogue already carries. Both matter for the same reason: a free-text
 * category invents a navigation node nobody browses to, and a free-text
 * brand creates the second "Dr. Fixit" — the storefront then lists one
 * manufacturer twice and splits its products between them.
 */
/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { writeFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const out = process.argv[2] ?? "research/data/categories.json";

  const categories = await db.category.findMany({
    where: { isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const brands = await db.brand.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });

  await writeFile(
    out,
    JSON.stringify(
      {
        categories: categories.map((c) => c.name),
        brands: brands.map((b) => b.name),
      },
      null,
      1,
    ),
  );

  console.info(
    `${categories.length} categories, ${brands.length} brands -> ${out}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
