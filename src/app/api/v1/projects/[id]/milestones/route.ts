import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  CALENDAR_DAY_MESSAGE,
  ProjectNotFoundError,
  createMilestone,
  isCalendarDay,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  title: z.string().trim().min(1, "Give the milestone a name").max(160),
  date: z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE),
  done: z.boolean().optional(),
});

/**
 * POST /api/v1/projects/{id}/milestones
 *
 * Adds a milestone to a project the caller owns.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, Body);

  try {
    const milestone = await createMilestone(user.id, id, body);
    return ok({ milestone }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      throw new ApiError("not_found", "No such project");
    }
    throw error;
  }
});
