/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";

/**
 * Take a brand's competitor-scraped rows out of the storefront.
 *
 *   npx tsx scripts/retire-scraped.ts --brand Jaquar --dry-run
 *   npx tsx scripts/retire-scraped.ts --brand Jaquar
 *   npx tsx scripts/retire-scraped.ts --brand Jaquar --restore
 *
 * Once a manufacturer's own catalogue is imported, the reseller listings
 * for that brand are the same products described worse: a reseller's
 * internal code instead of the manufacturer's, a scraped price instead of
 * the current one, and photography that belongs to somebody else.
 *
 * Deactivated, never deleted. The storefront only shows active products,
 * so this is enough to remove them, and --restore puts them back. Rows
 * that are wrong are easier to reason about than rows that are gone.
 */
const db = new PrismaClient();

const SCRAPED_SOURCES = ["handypanda", "homerun"];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const restore = args.includes("--restore");

  const brandArg = args.indexOf("--brand");
  const brand = brandArg === -1 ? undefined : args[brandArg + 1];
  if (!brand) throw new Error("usage: retire-scraped.ts --brand <name> [--dry-run] [--restore]");

  const where = {
    brand: { name: brand },
    sourceName: { in: SCRAPED_SOURCES },
    isActive: restore ? false : true,
  };

  const affected = await db.product.findMany({
    where,
    select: { sku: true, name: true, sourceName: true },
  });

  const replacements = await db.product.count({
    where: { brand: { name: brand }, sourceName: { contains: "catalogue" }, isActive: true },
  });

  console.info(
    `${affected.length} scraped ${brand} row(s) to ${restore ? "restore" : "retire"} · ` +
      `${replacements} from the manufacturer's catalogue remain`,
  );

  if (!affected.length) return;

  for (const p of affected.slice(0, 6)) {
    console.info(`  ${p.sku.padEnd(20)} ${p.sourceName?.padEnd(11)} ${p.name.slice(0, 46)}`);
  }
  if (affected.length > 6) console.info(`  … and ${affected.length - 6} more`);

  if (dryRun) {
    console.info("dry run — nothing changed");
    return;
  }

  /* Refuse to empty the shelf. If the catalogue import has not run, this
     would remove the brand from the storefront entirely rather than
     replacing worse rows with better ones. */
  if (!restore && replacements === 0) {
    throw new Error(
      `No ${brand} catalogue products to replace these with. Import the ` +
        "manufacturer's catalogue first, or this simply deletes the brand.",
    );
  }

  /* `restore` is the value the flag should end up as: restoring makes a
     row active, retiring makes it inactive. Writing `!restore` here reads
     naturally and is exactly backwards. */
  const result = await db.product.updateMany({ where, data: { isActive: restore } });
  console.info(`${restore ? "restored" : "retired"} ${result.count}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
