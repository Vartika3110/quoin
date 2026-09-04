/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

/**
 * Take a competitor's name off the catalogue.
 *
 *   npx tsx scripts/rebrand-scraped.ts                 # dry run, writes a plan
 *   npx tsx scripts/rebrand-scraped.ts --apply
 *   npx tsx scripts/rebrand-scraped.ts --restore <backup.json>
 *
 * The catalogue was seeded from a competitor's listings, and that
 * merchant's name arrived stamped in front of every product it sold —
 * including products it did not make. So the rows read "HomeRun Bosch
 * Professional GBH 220", where Bosch is the manufacturer and HomeRun is
 * simply the shop the row was scraped from.
 *
 * A find-and-replace to the house brand would therefore produce "Mars
 * Bosch Professional GBH 220", which is both nonsense and an assertion
 * that Mars built Bosch's drill. So the prefix is *stripped* rather than
 * swapped, and each row is then attributed:
 *
 *   - to the real manufacturer, where the remaining name starts with one
 *     — matched against the brands already in the database first, then a
 *     short list of makers that plainly appear but have no row yet;
 *   - to the house brand otherwise, which is what the generic stock
 *     actually is: tape, safety helmets, storage racks, saddles.
 *
 * Slugs are rebuilt on the importer's own convention, `brand name sku`,
 * so a rebranded row is indistinguishable from an imported one.
 *
 * Every run writes a backup of the previous values first, and --restore
 * puts them back. This edits live catalogue rows; it should be possible
 * to undo it without a database restore.
 */
const db = new PrismaClient();

/** The merchant names the catalogue was scraped from. */
const SCRAPED_BRANDS = ["HomeRun", "HandyPanda"];

/**
 * Placeholders the source export writes when a row has no manufacturer.
 *
 * They are brand rows in the database and they are not brands — the
 * storefront already suppresses them by name. Left alone they would win
 * the attribution match, because "Generic Blue Tarpaulin" does begin with
 * an existing brand called "Generic"; so they are stripped from the name
 * like the merchant prefix, and the row lands on the house brand, which
 * is what unbranded stock actually is.
 */
const PLACEHOLDER_BRANDS = ["Generic", "Local", "India"];

/** Where unattributable stock lands. */
const HOUSE_BRAND = "Mars";

/**
 * Manufacturers that appear in these names but have no brand row yet.
 *
 * Deliberately short and deliberately conservative: every entry is a
 * maker whose name is unambiguous at the front of a product name. A
 * speculative entry here mislabels stock, which is the failure this whole
 * script exists to avoid — anything not on this list and not already a
 * brand falls through to the house brand instead of being guessed at.
 */
const KNOWN_MAKERS = [
  "AO Smith", "Bosch", "Carysil", "Yale", "Stanley", "Makita", "DeWalt",
  "Prestige", "Usha", "Luminous", "Syska", "Wipro", "Hafele", "Cera",
  "Hindware", "Nerolac", "Berger", "Dulux", "Karcher", "Taparia", "Kajaria",
  "Bharat", "Elica", "Faber", "V-Guard", "Anchor", "Sujata", "Symphony",
];

/**
 * First words that identify a maker whose full name differs.
 *
 * "Asian Tractor Uno Acrylic Distemper" is an Asian Paints line; the row
 * would otherwise fall through to the house brand and put Mars on
 * somebody else's paint.
 */
const FIRST_WORD_ALIASES: Record<string, string> = {
  asian: "Asian Paints",
  birla: "Birla White",
  ultratech: "UltraTech",
};

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/** Matches the importer's collision handling exactly — see import-catalogue.ts. */
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

/** Whether `name` begins with `maker` on a word boundary. */
function startsWithMaker(name: string, maker: string): boolean {
  const escaped = maker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\b`, "i").test(name);
}

interface Plan {
  id: string;
  sku: string;
  oldName: string;
  newName: string;
  oldSlug: string;
  newSlug: string;
  oldBrand: string | null;
  newBrand: string;
  /* Why this row got the brand it did, so a dry run can be audited. */
  reason: "existing-brand" | "known-maker" | "first-word-alias" | "house";
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const restoreAt = args.indexOf("--restore");

  if (restoreAt !== -1) return restore(args[restoreAt + 1]);

  const products = await db.product.findMany({
    where: { brand: { name: { in: SCRAPED_BRANDS } } },
    select: { id: true, sku: true, name: true, slug: true, brand: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  if (products.length === 0) {
    console.info("Nothing to do — no products carry a scraped merchant's brand.");
    return;
  }

  /* Longest first, so "Birla White" is tried before "Birla" and "Dr Fixit"
     before anything that merely starts with "Dr". */
  const existingBrands = (
    await db.brand.findMany({ select: { name: true } })
  )
    .map((b) => b.name)
    .filter((n) => ![...SCRAPED_BRANDS, ...PLACEHOLDER_BRANDS].includes(n))
    .sort((a, b) => b.length - a.length);

  const makers = [...KNOWN_MAKERS].sort((a, b) => b.length - a.length);

  /* Uniqueness is decided against every slug already stored, minus the
     ones this run is about to free up. */
  const taken = new Set((await db.product.findMany({ select: { slug: true } })).map((p) => p.slug));
  for (const p of products) taken.delete(p.slug);

  const stripPrefix = new RegExp(
    `^(?:${[...SCRAPED_BRANDS, ...PLACEHOLDER_BRANDS].join("|")})\\s+`,
    "i",
  );

  const plans: Plan[] = products.map((p) => {
    /* Repeatedly, not once: the rows arrive as "HomeRun Generic Blue
       Tarpaulin", so stripping a single leading token leaves the
       placeholder behind in the visible name. */
    let newName = p.name;
    for (let before = ""; before !== newName; ) {
      before = newName;
      newName = newName.replace(stripPrefix, "").trim();
    }
    if (!newName) newName = p.name;

    let newBrand = HOUSE_BRAND;
    let reason: Plan["reason"] = "house";

    const existing = existingBrands.find((b) => startsWithMaker(newName, b));
    const maker = makers.find((m) => startsWithMaker(newName, m));
    const alias = FIRST_WORD_ALIASES[newName.split(/\s+/)[0]?.toLowerCase() ?? ""];

    if (existing) {
      newBrand = existing;
      reason = "existing-brand";
    } else if (maker) {
      newBrand = maker;
      reason = "known-maker";
    } else if (alias) {
      newBrand = alias;
      reason = "first-word-alias";
    }

    return {
      id: p.id,
      sku: p.sku,
      oldName: p.name,
      newName,
      oldSlug: p.slug,
      newSlug: uniqueSlug(`${newBrand} ${newName} ${p.sku}`, 280, taken),
      oldBrand: p.brand?.name ?? null,
      newBrand,
      reason,
    };
  });

  const attributed = plans.filter((p) => p.reason !== "house");
  const house = plans.filter((p) => p.reason === "house");

  console.info(
    `${plans.length} scraped row(s): ${attributed.length} attributed to a ` +
      `manufacturer, ${house.length} to ${HOUSE_BRAND}\n`,
  );

  console.info(`Attributed to a manufacturer (${attributed.length}):`);
  for (const p of attributed) {
    console.info(`  ${p.newBrand.padEnd(14)} ${p.newName.slice(0, 62)}`);
  }

  console.info(`\nTo ${HOUSE_BRAND} (${house.length}), first 15:`);
  for (const p of house.slice(0, 15)) {
    console.info(`  ${p.newName.slice(0, 70)}`);
  }

  /* The whole plan goes to a file, because 193 rows is more than anyone
     reads in a terminal and this is the artefact worth checking. */
  const planPath = path.join(process.cwd(), "rebrand-plan.tsv");
  writeFileSync(
    planPath,
    ["old_name\tnew_name\tnew_brand\treason\told_slug\tnew_slug"]
      .concat(
        plans.map((p) =>
          [p.oldName, p.newName, p.newBrand, p.reason, p.oldSlug, p.newSlug].join("\t"),
        ),
      )
      .join("\n"),
    "utf8",
  );
  console.info(`\nFull plan written to ${planPath}`);

  if (!apply) {
    console.info("\nDry run. Nothing was written. Re-run with --apply.");
    return;
  }

  /* Backup before the first write, not after — a crash halfway through
     must still be undoable. */
  mkdirSync(path.join(process.cwd(), ".backups"), { recursive: true });
  const backupPath = path.join(
    process.cwd(),
    ".backups",
    `rebrand-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    backupPath,
    JSON.stringify(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        brandName: p.brand?.name ?? null,
      })),
      null,
      2,
    ),
    "utf8",
  );
  console.info(`\nBackup written to ${backupPath}`);

  const brandIds = new Map<string, string>();
  const brandSlugs = new Set((await db.brand.findMany({ select: { slug: true } })).map((b) => b.slug));

  async function brandId(name: string): Promise<string> {
    const cached = brandIds.get(name);
    if (cached) return cached;
    const existing = await db.brand.findUnique({ where: { name } });
    const brand =
      existing ??
      (await db.brand.create({
        data: { name, slug: uniqueSlug(name, 140, brandSlugs) },
      }));
    brandIds.set(name, brand.id);
    return brand.id;
  }

  for (const p of plans) {
    await db.product.update({
      where: { id: p.id },
      data: { name: p.newName, slug: p.newSlug, brandId: await brandId(p.newBrand) },
    });
  }
  console.info(`\nUpdated ${plans.length} product(s).`);

  /* The merchant rows are now empty. Deactivated rather than deleted:
     `Product.brandId` is `onDelete: Restrict`, and a row that is wrong is
     easier to reason about than a row that is gone. */
  const emptied = await db.brand.updateMany({
    where: { name: { in: SCRAPED_BRANDS } },
    data: { isActive: false },
  });
  console.info(`Deactivated ${emptied.count} scraped merchant brand(s).`);
}

async function restore(file: string | undefined) {
  if (!file) throw new Error("usage: --restore <backup.json>");
  const rows: { id: string; name: string; slug: string; brandName: string | null }[] =
    JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(file, "utf8")));

  for (const row of rows) {
    const brand = row.brandName
      ? await db.brand.findUnique({ where: { name: row.brandName } })
      : null;
    await db.product.update({
      where: { id: row.id },
      data: { name: row.name, slug: row.slug, brandId: brand?.id ?? null },
    });
  }

  await db.brand.updateMany({
    where: { name: { in: SCRAPED_BRANDS } },
    data: { isActive: true },
  });
  console.info(`Restored ${rows.length} product(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
