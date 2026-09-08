import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import { ItemKindSchema, addSpaceItem, reorderSpaceItems } from "@/lib/data/studio";

type Ctx = { params: Promise<{ id: string }> };

/** ₹1,00,00,000 a unit. A tap is not ten crore, and a typo that adds two
    zeroes should be refused rather than quietly ruining a budget. */
const MAX_UNIT_PRICE_PAISE = 1_000_000_000;

const NewItem = z.object({
  kind: ItemKindSchema,
  ideaId: z.string().trim().min(1).max(40).optional(),
  productSlug: z.string().trim().min(1).max(280).optional(),
  variantId: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().max(160).optional(),
  brand: z.string().trim().max(80).optional(),
  hex: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, "Use a hex colour like #d9c9b4")
    .optional(),
  surface: z.string().trim().max(60).optional(),
  /* A Float and a free-text unit, exactly like `ProjectMaterial.qty`:
     "12.5 sq.ft." is a plan, not a quantity being transacted, and is
     snapped onto a variant's grid only if it is ever ordered. */
  qty: z.number().min(0).max(1_000_000).optional(),
  unit: z.string().trim().max(20).optional(),
  unitPricePaise: z.number().int().min(0).max(MAX_UNIT_PRICE_PAISE).optional(),
});

/** POST /api/v1/studio/spaces/{id}/items — add an idea, product,
    material, colour or note to a room. */
export const POST = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, NewItem);

  const item = await addSpaceItem(user.id, id, body);
  return ok({ item }, { status: 201 });
});

const Reorder = z.object({
  /* The whole intended order, not a from/to pair. See
     `reorderSpaceItems` for why a delta loses a race that dragging
     reliably produces. */
  order: z.array(z.string().trim().min(1).max(40)).max(500),
});

/** PATCH /api/v1/studio/spaces/{id}/items — reorder. */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, Reorder);

  if (!(await reorderSpaceItems(user.id, id, body.order))) {
    throw new ApiError("not_found", "No such space");
  }
  return ok({ reordered: true });
});
