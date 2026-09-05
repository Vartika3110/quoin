import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  CALENDAR_DAY_MESSAGE,
  MaterialStatusSchema,
  ProjectMaterialNotFoundError,
  deleteMaterial,
  isCalendarDay,
  updateMaterial,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string; materialId: string }> };

const MAX_UNIT_PRICE_PAISE = 1_000_000_00;
const MAX_QTY = 1_000_000;

const nullableText = (max: number) => z.union([z.null(), z.string().trim().max(max)]).optional();
const nullableDay = () =>
  z
    .union([z.null(), z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE)])
    .optional();

const Body = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  qty: z.number().positive().finite().max(MAX_QTY).optional(),
  unit: z.string().trim().max(40).optional(),
  unitPricePaise: z.number().int().min(0).max(MAX_UNIT_PRICE_PAISE).optional(),
  status: MaterialStatusSchema.optional(),
  productSlug: nullableText(160),
  variantId: nullableText(160),
  brand: nullableText(80),
  expectedOn: nullableDay(),
});

/**
 * PATCH /api/v1/projects/{id}/materials/{materialId}
 *
 * Typically a status change — planned → ordered → delivered — but any
 * field may move. `qty` is passed straight through: it is a Float on the
 * schema on purpose, and rounding it here would be exactly the mistake
 * the model comment warns against.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, materialId } = await params;
  const body = await parseBody(request, Body);

  try {
    const material = await updateMaterial(user.id, id, materialId, body);
    return ok({ material });
  } catch (error) {
    if (error instanceof ProjectMaterialNotFoundError) {
      throw new ApiError("not_found", "No such material");
    }
    throw error;
  }
});

export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, materialId } = await params;

  const removed = await deleteMaterial(user.id, id, materialId);
  if (!removed) throw new ApiError("not_found", "No such material");

  return ok({ deleted: true });
});
