import { z } from "zod";
import { handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  CALENDAR_DAY_MESSAGE,
  ProjectKindSchema,
  createProject,
  isCalendarDay,
  listProjectsForUser,
} from "@/lib/data/projects";

/** ₹10,00,00,000 — generous for a renovation budget, but a number rather
    than an unbounded one, same spirit as `MAX_UPLOAD_BYTES`. */
const MAX_BUDGET_PAISE = 10_000_000_000;
const MAX_SIZE_SQFT = 1_000_000;

const day = () => z.string().refine(isCalendarDay, CALENDAR_DAY_MESSAGE);

const Body = z.object({
  name: z.string().trim().min(1, "Give the project a name").max(120),
  kind: ProjectKindSchema,
  sizeSqft: z.number().int().min(0).max(MAX_SIZE_SQFT).optional().default(0),
  location: z.string().trim().max(200).optional().default(""),
  budgetPaise: z.number().int().min(0).max(MAX_BUDGET_PAISE).optional().default(0),
  startDate: day().optional(),
  targetDate: day().optional(),
  /* Capped the same way a Parcha's item list is: free-form text a
     customer typed, not a fixed vocabulary, but not an unbounded one. */
  requirements: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
});

/**
 * GET /api/v1/projects
 *
 * The signed-in customer's own projects, newest first. Archived projects
 * are hidden by default — `?archived=true` asks for them back, exactly
 * the shape the archive action needs to let someone find what they just
 * put away.
 */
export const GET = handler(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("archived") === "true";

  return ok({ projects: await listProjectsForUser(user.id, includeArchived) });
});

/**
 * POST /api/v1/projects
 *
 * Creates a project for the signed-in customer. It starts with no tasks,
 * materials or milestones of its own — `src/lib/store/projects.tsx`
 * seeded a few starting tasks from the chosen requirements on the client;
 * that is UI convenience, not something this endpoint reproduces, so a
 * caller that wants seeded tasks creates them with a follow-up
 * `POST .../tasks` per task.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, Body);

  const project = await createProject(user.id, {
    name: body.name,
    kind: body.kind,
    sizeSqft: body.sizeSqft,
    location: body.location,
    budgetPaise: body.budgetPaise,
    startDate: body.startDate,
    targetDate: body.targetDate,
    requirements: body.requirements,
  });

  return ok({ project }, { status: 201 });
});
