import { z } from "zod";
import { handler, ok, parseBody, requireUser } from "@/lib/http";
import { RoomSchema, VisibilitySchema, createSpace, listSpaces } from "@/lib/data/studio";

/** ₹10,00,00,000, the same ceiling `POST /api/v1/projects` puts on a
    budget: generous for one room, but a number rather than none. */
const MAX_BUDGET_PAISE = 10_000_000_000;

const Body = z.object({
  name: z.string().trim().min(1, "Give the space a name").max(80),
  room: RoomSchema.optional(),
  description: z.string().trim().max(400).optional().default(""),
  budgetPaise: z.number().int().min(0).max(MAX_BUDGET_PAISE).optional().default(0),
  /* Attaching a room to a build is optional and stays optional — see the
     note at the top of the Studio block in `prisma/schema.prisma`. */
  projectId: z.string().trim().min(1).max(40).optional(),
  visibility: VisibilitySchema.optional().default("private"),
});

/** GET /api/v1/studio/spaces — this customer's rooms, recently worked on
    first, each with its own item counts and planned total. */
export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ spaces: await listSpaces(user.id) });
});

/** POST /api/v1/studio/spaces */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, Body);

  const space = await createSpace(user.id, {
    name: body.name,
    room: body.room,
    description: body.description,
    budgetPaise: body.budgetPaise,
    projectId: body.projectId,
    visibility: body.visibility,
  });

  return ok({ space }, { status: 201 });
});
