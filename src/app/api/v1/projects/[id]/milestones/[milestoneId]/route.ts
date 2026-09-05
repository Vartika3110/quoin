import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  CALENDAR_DAY_MESSAGE,
  ProjectMilestoneNotFoundError,
  deleteMilestone,
  isCalendarDay,
  updateMilestone,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string; milestoneId: string }> };

const Body = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  date: z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE).optional(),
  done: z.boolean().optional(),
});

export const PATCH = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, milestoneId } = await params;
  const body = await parseBody(request, Body);

  try {
    const milestone = await updateMilestone(user.id, id, milestoneId, body);
    return ok({ milestone });
  } catch (error) {
    if (error instanceof ProjectMilestoneNotFoundError) {
      throw new ApiError("not_found", "No such milestone");
    }
    throw error;
  }
});

export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, milestoneId } = await params;

  const removed = await deleteMilestone(user.id, id, milestoneId);
  if (!removed) throw new ApiError("not_found", "No such milestone");

  return ok({ deleted: true });
});
