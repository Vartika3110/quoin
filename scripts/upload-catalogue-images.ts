/**
 * Put the generated catalogue imagery where production can read it.
 *
 *   npx tsx scripts/upload-catalogue-images.ts --dry-run
 *   npx tsx scripts/upload-catalogue-images.ts --limit 20
 *   npx tsx scripts/upload-catalogue-images.ts
 *
 * `public/generated` is gitignored — run output, not source — so a deploy
 * carries none of it and every `Product.image` pointing at `/generated/…`
 * is a path that resolves on one laptop and nowhere else. This uploads
 * those files to the public bucket and rewrites the rows to the bucket's
 * own URL, which is what the storefront can actually fetch.
 *
 * **A separate, public bucket.** `SUPABASE_STORAGE_BUCKET` is private
 * because it holds what customers upload, read only through short-lived
 * signed URLs. A catalogue tile is the opposite: one picture served to
 * everyone, forty to a grid, cached at the edge. Keeping them in
 * different buckets means nothing a customer uploads can ever be made
 * public by a mistake here.
 *
 * Resumable and idempotent: an object already in the bucket at the same
 * size is not re-uploaded, and the row is relinked whether or not this
 * run was the one that uploaded it — the two are independent, because a
 * run that dies between them must be repairable by running it again.
 */
/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SRC_DIR = path.join("public", "generated");
/** Mirrors the on-disk layout, so a key is readable next to a filename. */
const PREFIX = "generated";
const MAX_FAILURES = 10;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function config() {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_PUBLIC_BUCKET?.trim();
  if (!base || !key || !bucket) {
    throw new Error(
      "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_PUBLIC_BUCKET in .env.local",
    );
  }
  return { base, key, bucket };
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/** Public read, and a long cache — these files never change in place;
    a new picture is a new object, because the SKU names the file. */
async function ensureBucket(dryRun: boolean) {
  const { base, key, bucket } = config();
  const res = await fetch(`${base}/storage/v1/bucket/${bucket}`, { headers: headers(key) });
  if (res.ok) {
    const b = (await res.json()) as { public?: boolean };
    if (!b.public) {
      throw new Error(
        `Bucket "${bucket}" exists but is PRIVATE. A catalogue tile cannot be served from a signed URL — make it public in the dashboard, or point SUPABASE_PUBLIC_BUCKET at a new name.`,
      );
    }
    console.info(`bucket "${bucket}" exists and is public`);
    return;
  }
  if (dryRun) {
    console.info(`would create public bucket "${bucket}"`);
    return;
  }
  const made = await fetch(`${base}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers(key), "Content-Type": "application/json" },
    body: JSON.stringify({ name: bucket, id: bucket, public: true }),
  });
  if (!made.ok) throw new Error(`Could not create bucket: ${made.status} ${await made.text()}`);
  console.info(`created public bucket "${bucket}"`);
}

async function alreadyThere(key_: string, bytes: number): Promise<boolean> {
  const { base, key, bucket } = config();
  const res = await fetch(`${base}/storage/v1/object/info/public/${bucket}/${key_}`, {
    headers: headers(key),
  });
  if (!res.ok) return false;
  const info = (await res.json()) as { size?: number };
  return info.size === bytes;
}

async function put(key_: string, body: Buffer) {
  const { base, key, bucket } = config();
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${key_}`, {
    method: "POST",
    headers: {
      ...headers(key),
      "Content-Type": "image/webp",
      "x-upsert": "true",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
}

function publicUrl(key_: string) {
  const { base, bucket } = config();
  return `${base}/storage/v1/object/public/${bucket}/${key_}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = Number(arg("limit")) || undefined;

  await ensureBucket(dryRun);

  /* Only rows still pointing at the local path: one already rewritten to
     the bucket is done, and re-reading it would only cost bandwidth. */
  const rows = await db.product.findMany({
    where: { imageIsGenerated: true, image: { startsWith: "/generated/" } },
    select: { id: true, sku: true, image: true },
    orderBy: { sku: "asc" },
    take: limit,
  });
  console.info(`${rows.length} product row(s) still pointing at a local path`);

  let uploaded = 0;
  let skipped = 0;
  let relinked = 0;
  let failed = 0;
  let consecutive = 0;
  let bytes = 0;

  for (const [i, row] of rows.entries()) {
    const file = row.image.replace("/generated/", "");
    const from = path.join(SRC_DIR, file);
    if (!existsSync(from)) {
      console.error(`  ${row.sku}: ${row.image} is not on disk — skipped`);
      failed++;
      continue;
    }
    const key_ = `${PREFIX}/${file}`;

    try {
      const body = await readFile(from);
      if (await alreadyThere(key_, body.length)) {
        skipped++;
      } else {
        if (!dryRun) await put(key_, body);
        uploaded++;
        bytes += body.length;
      }
      if (!dryRun) {
        await db.product.update({ where: { id: row.id }, data: { image: publicUrl(key_) } });
        relinked++;
      }
      consecutive = 0;
    } catch (e) {
      failed++;
      consecutive++;
      console.error(`  ${row.sku}: ${(e as Error).message.split("\n")[0]}`);
      if (consecutive >= MAX_FAILURES) {
        console.error(`\nStopping: ${MAX_FAILURES} consecutive failures.`);
        break;
      }
    }

    if ((i + 1) % 100 === 0) console.info(`  [${i + 1}/${rows.length}]`);
  }

  console.info(
    `\n${dryRun ? "would upload" : "uploaded"} ${uploaded} · already present ${skipped} · ` +
      `${(bytes / 1024 / 1024).toFixed(1)}MB · ${dryRun ? "would relink" : "relinked"} ${relinked}` +
      (failed ? ` · failed ${failed}` : ""),
  );
  if (failed) console.info("Re-run to retry the failures; nothing is uploaded twice.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
