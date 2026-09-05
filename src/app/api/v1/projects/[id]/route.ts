import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  CALENDAR_DAY_MESSAGE,
  ProjectKindSchema,
  ProjectNotFoundError,
  deleteProject,
  getProjectForUser,
  isCalendarDay,
  updateProject,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BUDGET_PAISE = 10_000_000_000;
const MAX_SIZE_SQFT = 1_000_000;

/* `null` clears a date, an absent key leaves it alone, and a string must
   be a real calendar day — three states a plain `.optional()` cannot
   distinguish from just two. */
const nullableDay = () =>
  z
    .union([z.null(), z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE)])
    .optional();

const Body = z.object({
  name: z.string().trim().min(1, "Give the project a name").max(120).optional(),
  kind: ProjectKindSchema.optional(),
  sizeSqft: z.number().int().min(0).max(MAX_SIZE_SQFT).optional(),
  location: z.string().trim().max(200).optional(),
  budgetPaise: z.number().int().min(0).max(MAX_BUDGET_PAISE).optional(),
  startDate: nullableDay(),
  targetDate: nullableDay(),
  requirements: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  notes: z.string().trim().max(4000).optional(),
  archived: z.boolean().optional(),
});

/**
 * GET /api/v1/projects/{id}
 *
 * One project, in full — tasks, materials, milestones, documents and
 * linked orders — but only the requesting customer's own. A project that
 * belongs to someone else and one that does not exist both 404 the same
 * way, for the reason `getOrderForUser` gives for doing the same with an
 * order reference.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;

  const project = await getProjectForUser(user.id, id);
  if (!project) throw new ApiError("not_found", "No such project");

  return ok({ project });
});

/**
 * PATCH /api/v1/projects/{id}
 *
 * Renames, edits budget/dates/notes/requirements, and archives or
 * unarchives — one endpoint, because all of it is the same "change some
 * fields on a project I own" operation, and `archived` is just another
 * field on it. Every field is optional; only the ones present are
 * changed.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, Body);

  try {
    const project = await updateProject(user.id, id, body);
    return ok({ project });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      throw new ApiError("not_found", "No such project");
    }
    throw error;
  }
});

/**
 * DELETE /api/v1/projects/{id}
 *
 * Actual deletion — kept separate from archiving (`PATCH` with
 * `archived: true`), which only hides a project without destroying the
 * record of what it cost. `onDelete: Cascade` on every child table takes
 * the tasks, materials, milestones and document links with it; linked
 * orders themselves are untouched (`ProjectOrder.orderId` is `Restrict`).
 */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;

  const removed = await deleteProject(user.id, id);
  if (!removed) throw new ApiError("not_found", "No such project");

  return ok({ deleted: true });
});
