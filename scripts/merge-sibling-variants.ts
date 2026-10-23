/**
 * Fold sibling SKUs into one product with real variants.
 *
 * The catalogue was imported as a flat list of SKUs, so a product sold in
 * two pack sizes or two tints arrived as two products: `MYK Laticrete 307
 * Ceramic Tile Adhesive, Grey, 20 Kg Bag` and `… White, 20 Kg Bag` sit
 * beside each other in the grid as if they were unrelated goods. The
 * schema always expected better — `ProductVariant` carries its own label,
 * SKU, MRP, price, cost and min/step quantity, and the comment on
 * `costPaise` says in as many words that "a 20kg bag and a 50kg bag are
 * one product with two costs".
 *
 * This moves the variant rows rather than recreating them. That is the
 * whole safety argument: `PriceTier`, `InventoryItem` and `StockAlert`
 * hang off `variantId`, so a moved variant takes its stock, its volume
 * breaks and its back-in-stock subscribers with it, and no id that
 * anything else recorded ever changes. Orders are untouched by
 * construction — `OrderLine` deliberately holds no foreign key and
 * snapshots title, label and price as they read on the day.
 *
 * The absorbed product is deactivated, not deleted. Deleting would
 * cascade, and keeping the row means its SKU is still there for anyone
 * reconciling against a supplier's list.
 *
 *   npx tsx scripts/merge-sibling-variants.ts            # dry run
 *   npx tsx scripts/merge-sibling-variants.ts --apply    # write
 */
/* Must be first: populates process.env before Prisma is constructed. A
   standalone `tsx` script gets none of Next's env loading, and without
   this the first query fails on a missing DATABASE_URL. */
import "../src/lib/load-env-file";

import { PrismaClient, type PricingUnit } from "@prisma/client";

const db = new PrismaClient();

/**
 * Every family, written out rather than matched at runtime.
 *
 * A regex over product names found these, but a regex is not what should
 * be pointed at a production catalogue: this table is reviewable, it
 * fails loudly when a SKU it names has moved, and it cannot surprise
 * anybody by matching a twenty-seventh row next month.
 *
 * The first member is the parent — it keeps its id, slug, images and
 * description, and the others fold into it. Cheapest first, so the
 * surviving product quotes the lower "from" price.
 */
type Family = {
  /** What the merged product is called, with the qualifier removed. */
  name: string;
  /** Set where the members disagree and one of them is simply wrong. */
  unit?: PricingUnit;
  /** `[parentSku, …absorbedSkus]`, each with the label its variant takes. */
  members: { sku: string; label: string }[];
};

const FAMILIES: Family[] = [
  /* Asian Paints sells each line as a tintable base and a ready colour.
     Same tin, same litre, different starting point. */
  { name: "Asian Paints Ace", members: [
    { sku: "47YBJ", label: "Base White" }, { sku: "ZNB7D", label: "Colour" }] },
  { name: "Asian Paints Apex", members: [
    { sku: "ET9RL", label: "Base White" }, { sku: "Z49HF", label: "Colour" }] },
  { name: "Asian Paints Apex Ultima", members: [
    { sku: "2MEPU", label: "Base White" }, { sku: "LWCHF", label: "Colour" }] },
  { name: "Asian Paints Apex Ultima Protek", members: [
    { sku: "2K88T", label: "Base White" }, { sku: "7DNGM", label: "Colour" }] },
  { name: "Asian Paints Premium Emulsion Paints", members: [
    { sku: "Q87VE", label: "Base White" }, { sku: "9KXFQ", label: "Colour" }] },
  { name: "Asian Paints Royale Luxury Emulsion", members: [
    { sku: "6EVN5", label: "Base White" }, { sku: "DLKPD", label: "Colour" }] },
  { name: "Asian Paints Tractor Emulsion", members: [
    { sku: "3VV8F", label: "Base White" }, { sku: "77HVD", label: "Colour" }] },

  /* A 1kg tub and a 50kg bag of the same cement. */
  { name: "Birla White Portland Cement", members: [
    { sku: "ADHBIRWHI8T2QR", label: "1 kg" }, { sku: "UVJQ9", label: "50 kg" }] },

  /* Two pack sizes. The 20kg row is filed `PER_PIECE` and the 30kg one
     `PER_BAG`; they are both bags, and the merged product says so. */
  { name: "MYK Laticrete 305 Tile Adhesive, Grey", unit: "PER_BAG", members: [
    { sku: "TILMYKLAT89N3B", label: "20 kg" }, { sku: "64LE6", label: "30 kg" }] },

  /* Grey and white of the same adhesive, same bag. */
  { name: "MYK Laticrete 307 Ceramic Tile Adhesive, 20 Kg Bag", members: [
    { sku: "2R8CG", label: "Grey" }, { sku: "QYJ97", label: "White" }] },
  { name: "MYK Laticrete 315 Plus Tile Adhesive, 20 Kg Bag", members: [
    { sku: "XQLUC", label: "Grey" }, { sku: "GBACW", label: "White" }] },
  { name: "MYK Laticrete 325 High Flex Tile & Stone Adhesive, 20 Kg Bag", members: [
    { sku: "DD3G8", label: "Grey" }, { sku: "Z257Y", label: "White" }] },
  { name: "MYK Laticrete 335 Super Flex Tile & Stone Adhesive, 20 Kg Bag", members: [
    { sku: "H9N6S", label: "Grey" }, { sku: "T8DP9", label: "White" }] },
];

const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "APPLYING\n" : "DRY RUN — nothing is written\n");

  let merged = 0;
  let moved = 0;
  let retired = 0;

  for (const family of FAMILIES) {
    const rows = await Promise.all(
      family.members.map((m) =>
        db.product.findUnique({
          where: { sku: m.sku },
          select: {
            id: true, sku: true, name: true, slug: true, isActive: true,
            pricingUnit: true,
            variants: { select: { id: true, sku: true, isActive: true, pricePaise: true } },
          },
        }),
      ),
    );

    /* Loudly, not silently. A family whose SKU has been retired or
       renamed since this table was written is a question for a person,
       not a row to skip past. */
    const missing = family.members.filter((m, i) => !rows[i]).map((m) => m.sku);
    if (missing.length > 0) {
      console.log(`SKIP  ${family.name}\n      missing SKU(s): ${missing.join(", ")}\n`);
      continue;
    }

    const [parent, ...absorbed] = rows.map((r) => r!);
    console.log(`${family.name}`);
    console.log(`   parent  ${parent.sku}  "${parent.name}"  /p/${parent.slug}`);

    for (const [i, source] of absorbed.entries()) {
      const label = family.members[i + 1].label;
      const live = source.variants.filter((v) => v.isActive);
      console.log(
        `   absorb  ${source.sku}  "${source.name}"` +
          `\n             ${live.length} variant(s) → "${label}" on the parent; product deactivated`,
      );
      moved += live.length;
      retired += 1;
    }
    console.log(
      `   result  "${family.name}"` +
        ` with ${rows.reduce((n, r) => n + r!.variants.filter((v) => v.isActive).length, 0)} variants` +
        (family.unit && family.unit !== parent.pricingUnit
          ? `, priced ${family.unit} (was ${parent.pricingUnit})`
          : ""),
    );
    console.log("");
    merged += 1;

    if (!apply) continue;

    /* One transaction per family: a half-merged product — variants moved
       but the source still live, or renamed but nothing moved — is worse
       than either end state, and a family is small enough that there is
       no reason to risk it. */
    await db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: parent.id },
        data: {
          name: family.name,
          ...(family.unit ? { pricingUnit: family.unit } : {}),
        },
      });

      /* The parent's own variant gets its label too — it was "Standard",
         which is the right word for a product with one option and the
         wrong one for a product with two. */
      for (const variant of parent.variants) {
        await tx.productVariant.update({
          where: { id: variant.id },
          data: { label: family.members[0].label, isDefault: true },
        });
      }

      for (const [i, source] of absorbed.entries()) {
        const label = family.members[i + 1].label;
        await tx.productVariant.updateMany({
          where: { productId: source.id },
          data: { productId: parent.id, label, isDefault: false },
        });
        await tx.product.update({
          where: { id: source.id },
          data: { isActive: false },
        });
      }
    });
  }

  console.log(
    `${apply ? "Merged" : "Would merge"} ${merged} families: ` +
      `${moved} variant(s) moved, ${retired} product(s) deactivated.`,
  );
  if (!apply) console.log("\nRe-run with --apply to write.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
