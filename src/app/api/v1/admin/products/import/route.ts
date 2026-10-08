import { z } from "zod";
import { db } from "@/lib/db";
import {
  MAX_IMPORT_ROWS,
  parseProductCsv,
  type ParsedRow,
  type RowProblem,
} from "@/lib/admin/product-import";
import { reserveProductSlug, reserveVariantSku } from "@/lib/data/catalog-admin";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";

/**
 * Bulk upload, in two passes.
 *
 * `apply: false` parses, validates and diffs against the catalogue, and
 * writes nothing. `apply: true` does the identical work and then commits
 * it. The preview a merchandiser confirms therefore comes from the same
 * code path as the write, rather than from a second description of it
 * that is free to be wrong.
 *
 * The file is posted twice rather than stashed between the two calls. It
 * is a few hundred rows of text, and the alternative — a server-side
 * staging table or an upload id — adds a thing that can expire, leak or
 * be replayed, to save one upload of something small.
 *
 * **Idempotent on `sku`**, matching `prisma/import-catalogue.ts`. The same
 * file applied twice creates on the first run and updates in place on the
 * second; it never makes a duplicate product. That also makes this the
 * tool for a bulk *reprice*: export the sheet, edit the price column,
 * upload it again.
 *
 * Slugs are assigned on creation only, so re-uploading never changes a
 * URL that has been indexed.
 */

const ImportInput = z.object({
  csv: z.string().min(1, "The file is empty").max(2_000_000, "That file is too large"),
  /** False previews, true commits. Defaults to the safe one. */
  apply: z.boolean().default(false),
});

type Action = "create" | "update" | "error";

interface RowPlan {
  line: number;
  sku: string;
  name: string;
  action: Action;
  /** What will change about this product, in words, for the preview. */
  changes: string[];
  message?: string;
}

export const POST = handler(async (request) => {
  await requireStaff();

  const input = await parseBody(request, ImportInput);
  const parsed = parseProductCsv(input.csv);

  if (parsed.missingColumns.length > 0) {
    throw new ApiError(
      "bad_request",
      `The file is missing a required column: ${parsed.missingColumns.join(", ")}`,
    );
  }

  if (parsed.totalRows > MAX_IMPORT_ROWS) {
    throw new ApiError(
      "bad_request",
      `${parsed.totalRows} rows is more than this screen takes. Split the file into ` +
        `${MAX_IMPORT_ROWS}-row chunks, or run the catalogue importer for a whole supplier export.`,
    );
  }

  /* Brands and categories are matched, never created. The catalogue
     already carries "Dr Fixit" and "Dr. Fixit", "Ultratech" and
     "UltraTech" as separate rows — every one of them arrived because
     something upstream created a brand from a spelling instead of
     refusing it. An unknown name is an error on that row. */
  const [brands, categories] = await Promise.all([
    db.brand.findMany({ select: { id: true, name: true } }),
    db.category.findMany({ select: { id: true, name: true } }),
  ]);
  const brandByName = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  const existing = await db.product.findMany({
    where: { sku: { in: parsed.rows.map((r) => r.sku) } },
    select: {
      id: true,
      sku: true,
      name: true,
      isActive: true,
      variants: {
        where: { isDefault: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, mrpPaise: true, pricePaise: true, proPricePaise: true },
      },
    },
  });
  const bySku = new Map(existing.map((p) => [p.sku, p]));

  const problems: RowProblem[] = [...parsed.problems];
  const plans: RowPlan[] = [];
  /* Rows that passed every check, paired with what they resolved to. A
     row only reaches this list if it could be applied. */
  const ready: { row: ParsedRow; brandId: string | null; categoryId: string | null }[] = [];

  for (const row of parsed.rows) {
    let brandId: string | null = null;
    if (row.brand) {
      brandId = brandByName.get(row.brand.toLowerCase()) ?? null;
      if (!brandId) {
        problems.push({
          line: row.line,
          sku: row.sku,
          message: `No brand called “${row.brand}”. Add it first, or correct the spelling.`,
        });
        continue;
      }
    }

    let categoryId: string | null = null;
    if (row.category) {
      categoryId = categoryByName.get(row.category.toLowerCase()) ?? null;
      if (!categoryId) {
        problems.push({
          line: row.line,
          sku: row.sku,
          message: `No category called “${row.category}”.`,
        });
        continue;
      }
    }

    const current = bySku.get(row.sku);
    const changes: string[] = [];

    if (current) {
      if (current.name !== row.name) changes.push("name");
      const variant = current.variants[0];
      if (!variant) {
        changes.push("adds its first price");
      } else {
        if (variant.mrpPaise !== row.mrpPaise) changes.push("MRP");
        if (variant.pricePaise !== row.pricePaise) changes.push("sell price");
        if ((variant.proPricePaise ?? null) !== row.proPricePaise) changes.push("Pro price");
      }
      if (row.gstRatePct != null) changes.push("GST");
      if (row.category) changes.push("category");
      if (!current.isActive) changes.push("brings it back from retired");
    }

    plans.push({
      line: row.line,
      sku: row.sku,
      name: row.name,
      action: current ? "update" : "create",
      changes: current && changes.length === 0 ? ["nothing — already matches"] : changes,
    });
    ready.push({ row, brandId, categoryId });
  }

  for (const problem of problems) {
    plans.push({
      line: problem.line,
      sku: problem.sku,
      name: "",
      action: "error",
      changes: [],
      message: problem.message,
    });
  }
  plans.sort((a, b) => a.line - b.line);

  const summary = {
    willCreate: plans.filter((p) => p.action === "create").length,
    willUpdate: plans.filter((p) => p.action === "update").length,
    rejected: problems.length,
    totalRows: parsed.totalRows,
    unknownColumns: parsed.unknownColumns,
  };

  if (!input.apply) {
    return ok({ applied: false, summary, plans });
  }

  /* Nothing is written while any row is bad. A merchandiser fixing a
     typo on line 40 should not have to work out which of the first 39
     already landed — and a half-applied price list is a half-wrong shop.
     The preview has already shown them exactly this list. */
  if (problems.length > 0) {
    throw new ApiError(
      "bad_request",
      `${problems.length} row${problems.length === 1 ? "" : "s"} cannot be applied. ` +
        "Fix them in the file and upload it again — nothing has been changed.",
    );
  }

  let created = 0;
  let updated = 0;

  for (const { row, brandId, categoryId } of ready) {
    const current = bySku.get(row.sku);

    if (!current) {
      const slug = await reserveProductSlug({ brand: row.brand, name: row.name, sku: row.sku });
      const variantSku = await reserveVariantSku(row.sku);

      await db.product.create({
        data: {
          sku: row.sku,
          slug,
          name: row.name,
          description: row.description ?? "",
          brandId,
          categoryId,
          gstRatePct: row.gstRatePct ?? 18,
          fulfilment: row.fulfilment ?? "SCHEDULED",
          pricingUnit: row.unit ?? "PER_PIECE",
          leadTimeDays: row.fulfilment === "BOOKABLE" ? null : row.leadTimeDays,
          variants: {
            create: {
              sku: variantSku,
              label: "Standard",
              mrpPaise: row.mrpPaise,
              pricePaise: row.pricePaise,
              proPricePaise: row.proPricePaise,
              minQty: row.minQty ?? 1,
              stepQty: row.stepQty ?? 1,
              isDefault: true,
            },
          },
        },
      });
      created += 1;
      continue;
    }

    /* Updates are sparse: a column the sheet left blank means "leave this
       alone", not "clear it". A bulk reprice that silently emptied every
       description would be the last time anyone used this screen. */
    await db.product.update({
      where: { id: current.id },
      data: {
        name: row.name,
        ...(row.description != null ? { description: row.description } : {}),
        ...(brandId ? { brandId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(row.gstRatePct != null ? { gstRatePct: row.gstRatePct } : {}),
        ...(row.fulfilment ? { fulfilment: row.fulfilment } : {}),
        ...(row.unit ? { pricingUnit: row.unit } : {}),
        ...(row.leadTimeDays != null ? { leadTimeDays: row.leadTimeDays } : {}),
      },
    });

    const variant = current.variants[0];
    if (variant) {
      await db.productVariant.update({
        where: { id: variant.id },
        data: {
          mrpPaise: row.mrpPaise,
          pricePaise: row.pricePaise,
          proPricePaise: row.proPricePaise,
          ...(row.minQty != null ? { minQty: row.minQty } : {}),
          ...(row.stepQty != null ? { stepQty: row.stepQty } : {}),
        },
      });
    } else {
      await db.productVariant.create({
        data: {
          sku: await reserveVariantSku(row.sku),
          productId: current.id,
          label: "Standard",
          mrpPaise: row.mrpPaise,
          pricePaise: row.pricePaise,
          proPricePaise: row.proPricePaise,
          minQty: row.minQty ?? 1,
          stepQty: row.stepQty ?? 1,
          isDefault: true,
        },
      });
    }
    updated += 1;
  }

  return ok({ applied: true, summary: { ...summary, created, updated }, plans });
});
