/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

/**
 * Attach harvested photographs to products whose code proves the match.
 *
 *   npx tsx scripts/pair-images-by-code.ts --dry-run
 *   npx tsx scripts/pair-images-by-code.ts --brand Jaquar
 *
 * Only exact code matches, and the finish-stripped form the technical
 * catalogue uses — ARI-39441K for ARI-CHR-39441K. Nothing fuzzier.
 *
 * Name similarity was tried and rejected: "Wall Mounted Single Lever
 * Basin Mixer" scores 0.63 against "Floor Mounted Single Lever Basin
 * Mixer", which is a different product. A wrong photograph is worse than
 * no photograph, because a customer believes it.
 */
const db = new PrismaClient();

const HARVEST_ROOT = path.join("research", "data", "catalogues");
const PUBLIC_ROOT = path.join("public", "catalogue");

/** ARI-CHR-39441K and ARI-39441K are the same fitting in two catalogues. */
function withoutFinish(code: string): string {
  const parts = code.split("-");
  return parts.length === 3 ? `${parts[0]}-${parts[2]}` : code;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const brandArg = args.indexOf("--brand");
  const brand = brandArg === -1 ? undefined : args[brandArg + 1];

  /* Both spellings of every code point at the file, so a product written
     either way finds it. First writer wins, so a direct hit is never
     displaced by a stripped one. */
  const byCode = new Map<string, { source: string; file: string }>();
  for (const source of await readdir(HARVEST_ROOT)) {
    let files: string[];
    try {
      files = await readdir(path.join(HARVEST_ROOT, source, "images"));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".jpg")) continue;
      const code = file.replace(/\.jpg$/, "");
      /* Harvested-by-page names (p0057-04) identify nothing. Skip them. */
      if (/^p\d{4}-\d{2}$/.test(code)) continue;

      if (!byCode.has(code)) byCode.set(code, { source, file });
      const stripped = withoutFinish(code);
      if (!byCode.has(stripped)) byCode.set(stripped, { source, file });
    }
  }
  console.info(`${byCode.size} harvested images identified by product code`);

  const products = await db.product.findMany({
    where: {
      isActive: true,
      image: "",
      ...(brand ? { brand: { name: brand } } : {}),
    },
    select: { id: true, sku: true, name: true },
  });
  console.info(`${products.length} product(s) without a photograph${brand ? ` for ${brand}` : ""}`);

  let paired = 0;
  for (const product of products) {
    const hit = byCode.get(product.sku) ?? byCode.get(withoutFinish(product.sku));
    if (!hit) continue;

    paired++;
    if (dryRun) {
      console.info(`  ${product.sku} -> ${hit.source}/${hit.file}`);
      continue;
    }

    const outDir = path.join(PUBLIC_ROOT, hit.source);
    await mkdir(outDir, { recursive: true });

    const name = `${product.sku.replace(/[^A-Za-z0-9._-]/g, "_")}.jpg`;
    await copyFile(path.join(HARVEST_ROOT, hit.source, "images", hit.file), path.join(outDir, name));

    await db.product.update({
      where: { id: product.id },
      data: { image: `/catalogue/${hit.source}/${name}`, imageIsGenerated: false },
    });
  }

  console.info(`${dryRun ? "would pair" : "paired"} ${paired}`);
  if (paired < products.length) {
    console.info(
      `${products.length - paired} have no image whose code proves it belongs to them — ` +
        "those need /admin/images and a pair of eyes.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
