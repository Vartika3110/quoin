import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import { removeSpaceItem, updateSpaceItem } from "@/lib/data/studio";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const MAX_UNIT_PRICE_PAISE = 1_000_000_000;

const Patch = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  surface: z.string().trim().max(60).optional(),
  qty: z.number().min(0).max(1_000_000).optional(),
  unit: z.string().trim().max(20).optional(),
  unitPricePaise: z.number().int().min(0).max(MAX_UNIT_PRICE_PAISE).optional(),
});

/** PATCH /api/v1/studio/spaces/{id}/items/{itemId} — quantity, unit,
    price and label. What an item *is* cannot be edited: a colour does not
    become a product, it is deleted and something else is added. */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, itemId } = await params;
  const patch = await parseBody(request, Patch);

  if (!(await updateSpaceItem(user.id, id, itemId, patch))) {
    throw new ApiError("not_found", "No such item");
  }
  return ok({ updated: true });
});

/** DELETE /api/v1/studio/spaces/{id}/items/{itemId} */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, itemId } = await params;

  if (!(await removeSpaceItem(user.id, id, itemId))) {
    throw new ApiError("not_found", "No such item");
  }
  return ok({ deleted: true });
});
