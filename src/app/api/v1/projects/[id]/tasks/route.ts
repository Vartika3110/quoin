import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  CALENDAR_DAY_MESSAGE,
  ProjectNotFoundError,
  TaskStatusSchema,
  createTask,
  isCalendarDay,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(160),
  status: TaskStatusSchema.optional(),
  phase: z.string().trim().max(80).optional(),
  dueDate: z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE).optional(),
});

/**
 * POST /api/v1/projects/{id}/tasks
 *
 * Adds a task to a project the caller owns — the ownership check is
 * `createTask`'s own `findFirst`, not a step taken here.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, Body);

  try {
    const task = await createTask(user.id, id, body);
    return ok({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      throw new ApiError("not_found", "No such project");
    }
    throw error;
  }
});
