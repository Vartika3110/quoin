import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  CALENDAR_DAY_MESSAGE,
  ProjectTaskNotFoundError,
  TaskStatusSchema,
  deleteTask,
  isCalendarDay,
  updateTask,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string; taskId: string }> };

const nullableDay = () =>
  z
    .union([z.null(), z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE)])
    .optional();

const Body = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  status: TaskStatusSchema.optional(),
  phase: z.union([z.null(), z.string().trim().max(80)]).optional(),
  dueDate: nullableDay(),
});

/**
 * PATCH /api/v1/projects/{id}/tasks/{taskId}
 *
 * `updateTask` re-checks `taskId` against *both* `projectId` and the
 * caller's `userId` in one statement — see the file-level note in
 * `src/lib/data/projects.ts` on why a task id from someone else's project
 * must not become editable just because the URL's project id is one the
 * caller does own.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, taskId } = await params;
  const body = await parseBody(request, Body);

  try {
    const task = await updateTask(user.id, id, taskId, body);
    return ok({ task });
  } catch (error) {
    if (error instanceof ProjectTaskNotFoundError) {
      throw new ApiError("not_found", "No such task");
    }
    throw error;
  }
});

export const DELETE = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, taskId } = await params;

  const removed = await deleteTask(user.id, id, taskId);
  if (!removed) throw new ApiError("not_found", "No such task");

  return ok({ deleted: true });
});
