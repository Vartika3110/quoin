import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import { harvestImagePath } from "@/lib/data/harvest";

type Ctx = { params: Promise<{ sku: string }> };

const AssignInput = z.object({
  source: z.string().min(1).max(80),
  file: z.string().min(1).max(120),
});

/**
 * POST /api/v1/admin/products/{sku}/image
 *
 * Attaches a harvested photograph to a product, which is the moment it
 * becomes public — the file is copied into `public/` here and not before.
 *
 * `imageIsGenerated` is cleared: this is a photograph from the
 * manufacturer's own catalogue, so the "illustration" disclaimer that
 * belongs on generated artwork would be a lie on this one.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  await requireStaff();

  const { sku } = await params;
  const { source, file } = await parseBody(request, AssignInput);

  const product = await db.product.findUnique({ where: { sku } });
  if (!product) throw new ApiError("not_found", "No such product");

  let origin: string | null = null;
  try {
    origin = await harvestImagePath(source, file);
  } catch {
    throw new ApiError("bad_request", "Invalid image reference");
  }
  if (!origin) throw new ApiError("not_found", "No such image");

  const outDir = path.join("public", "catalogue", source);
  await mkdir(outDir, { recursive: true });

  /* Named by SKU, not by the harvest name. Two products may legitimately
     be given the same source image, and `p0057-04.jpg` says nothing about
     what it depicts once it is out of the catalogue. */
  const name = `${sku.replace(/[^A-Za-z0-9._-]/g, "_")}.jpg`;
  await copyFile(origin, path.join(outDir, name));

  const image = `/catalogue/${source}/${name}`;
  await db.product.update({
    where: { id: product.id },
    data: { image, imageIsGenerated: false },
  });

  return ok({ sku, image });
});
