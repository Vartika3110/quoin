import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  CALENDAR_DAY_MESSAGE,
  MaterialStatusSchema,
  ProjectNotFoundError,
  createMaterial,
  isCalendarDay,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string }> };

/** ₹10,00,000 a line — a material plan, not a cart, so generous rather
    than exact, but still a bound rather than an open `Int`. */
const MAX_UNIT_PRICE_PAISE = 1_000_000_00;
const MAX_QTY = 1_000_000;

const Body = z.object({
  title: z.string().trim().min(1, "Give the material a name").max(160),
  qty: z.number().positive().finite().max(MAX_QTY),
  unit: z.string().trim().max(40).optional(),
  unitPricePaise: z.number().int().min(0).max(MAX_UNIT_PRICE_PAISE).optional(),
  status: MaterialStatusSchema.optional(),
  productSlug: z.string().trim().max(160).optional(),
  variantId: z.string().trim().max(160).optional(),
  brand: z.string().trim().max(80).optional(),
  expectedOn: z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE).optional(),
});

/**
 * POST /api/v1/projects/{id}/materials
 *
 * Adds a material line to a project the caller owns. `qty` is a Float and
 * is never rounded or snapped onto a variant's grid here — see the model
 * comment on `ProjectMaterial.qty`: this is a plan, and it is only
 * snapped when it becomes an order.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, Body);

  try {
    const material = await createMaterial(user.id, id, body);
    return ok({ material }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      throw new ApiError("not_found", "No such project");
    }
    throw error;
  }
});
