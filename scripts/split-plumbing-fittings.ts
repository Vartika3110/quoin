/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";
import { classifyProductType } from "../src/lib/product-types";

/**
 * Split pipework out of `bathware-plumbing` into its own department.
 *
 * One department held both halves of a bathroom job: the sanitaryware a
 * homeowner picks — basins, WCs, showers, mixers — and the CPVC a plumber
 * fits behind the wall. 163 products in one grid, sharing no brand, no
 * price range and no buyer. The reference design separates them, and so
 * does every counter in the trade.
 *
 * **Which products move is decided by the shelf rules, not by a list of
 * SKUs.** `src/lib/product-types.ts` already sorts this department into
 * wastes, valves and pipes, and those three are exactly the new
 * department — so the split is the same classification the storefront has
 * been showing all along, made permanent. That also means this script and
 * the sidebar can never disagree about where a product belongs.
 *
 * Products the rules cannot place stay put: `CP Cap`, `Hexa Blade` and
 * the two fasteners are not pipework by any reading, and moving things a
 * rule did not name is how a migration becomes a mess nobody can audit.
 *
 *   npx tsx scripts/split-plumbing-fittings.ts            # dry run
 *   npx tsx scripts/split-plumbing-fittings.ts --apply    # write
 */
const db = new PrismaClient();

const FROM = "bathware-plumbing";
const TO = "plumbing-fittings";

/** The shelves that become the new department. */
const MOVING = ["wastes-traps", "valves", "pipes-fittings"];

/**
 * `bathware-plumbing` keeps its slug although it is renamed.
 *
 * The slug is in every shared and indexed URL for the department, and
 * `/c/bathware-plumbing` has been the bathroom listing since launch.
 * Renaming the row costs nothing; renaming the slug 404s a live page to
 * tidy up a string nobody reads.
 */
const RENAME_TO = "Bathware & Sanitary";

const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "APPLYING\n" : "DRY RUN — nothing is written\n");

  const from = await db.category.findUnique({
    where: { slug: FROM },
    select: { id: true, name: true, position: true },
  });
  if (!from) throw new Error(`No category "${FROM}" — nothing to split.`);

  const products = await db.product.findMany({
    where: {
      categoryId: from.id,
      isActive: true,
      variants: { some: { isActive: true } },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const moving: { id: string; name: string; shelf: string }[] = [];
  const staying: string[] = [];

  for (const product of products) {
    /* **Bathware first, then plumbing** — and that order is the whole
       correctness argument.
     *
     * The rules have already been split, so neither department alone
     * reproduces the single ordered list this department used to have.
     * Asking plumbing on its own would drag every bathroom tap across
     * with it: `Florentine Prime Stop Cock` matches `cock`, which is a
     * valve term, and it is a basin tap. Asking bathware first restores
     * the precedence the one list had — taps outrank valves, wastes
     * outrank pipes — so a product moves only when nothing on the
     * bathroom side wanted it.
     *
     * Anything neither side claims stays where it is. `CP Cap`,
     * `Hexa Blade` and the two fasteners are not pipework by any
     * reading, and moving rows no rule named is how a migration becomes
     * something nobody can audit afterwards. */
    if (classifyProductType(FROM, product.name)) {
      staying.push(product.name);
      continue;
    }

    const shelf = classifyProductType(TO, product.name);
    if (shelf && MOVING.includes(shelf)) {
      moving.push({ ...product, shelf });
    } else {
      staying.push(product.name);
    }
  }

  for (const shelf of MOVING) {
    const rows = moving.filter((m) => m.shelf === shelf);
    console.log(`→ ${shelf} (${rows.length})`);
    for (const row of rows) console.log(`     ${row.name}`);
    console.log("");
  }

  console.log(`"${from.name}" → "${RENAME_TO}", keeping /c/${FROM}`);
  console.log(`  moves to /c/${TO}: ${moving.length}`);
  console.log(`  stays:            ${staying.length}  (of ${products.length})`);

  if (!apply) {
    console.log("\nRe-run with --apply to write.");
    return;
  }

  await db.$transaction(async (tx) => {
    const to = await tx.category.upsert({
      where: { slug: TO },
      update: {},
      create: {
        slug: TO,
        name: "Plumbing fittings",
        /* The same `position` as the department it came out of, not one
           past it.
           
           `getCategories` orders by position then name, and every
           department in the catalogue is position 0 — so the list is
           alphabetical in practice, and a single row at position 1 is
           not "just after Bathware", it is pinned to the end of the
           directory on its own. Matching the rest puts it back in the
           alphabet with them. */
        position: from.position,
      },
      select: { id: true },
    });

    await tx.product.updateMany({
      where: { id: { in: moving.map((m) => m.id) } },
      data: { categoryId: to.id },
    });

    await tx.category.update({
      where: { id: from.id },
      data: { name: RENAME_TO },
    });
  });

  console.log(`\nMoved ${moving.length} products into /c/${TO}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
