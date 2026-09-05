import { Prisma } from "@prisma/client";
import { z } from "zod";
import type {
  ProjectKind as DbProjectKind,
  ProjectTaskStatus as DbTaskStatus,
  ProjectMaterialStatus as DbMaterialStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import type { Paise } from "@/lib/types/catalog";

/**
 * Projects — the server side of `src/lib/store/projects.tsx`.
 *
 * That store is (for now) the client's own copy, held in `localStorage`
 * and shaped as whole-object replaces keyed by id. This module is the
 * thing it is being pointed at: every read is scoped to one `userId`
 * inside the `where` clause itself, and the wire shape below is the same
 * shape the store already produces, so porting it is an implementation
 * change in the store, not a redesign of what a `Project` is.
 *
 * `ProjectKind`/task/material status are lower-snake on the wire, exactly
 * as the catalogue and consultations already are, and SCREAMING_SNAKE in
 * Postgres. The two `Record`s below are the *only* place that mapping is
 * written down — every other module, including the client store's own
 * rewrite, is meant to consume these exports rather than re-derive the
 * mapping from `toUpperCase()`/`toLowerCase()`, which would silently
 * accept a value neither side actually defined.
 */

/** ---- Kind mapping --------------------------------------------------------
 * Wire/client vocabulary. Kept identical to the pre-existing
 * `src/lib/store/projects.tsx` union so a rewritten store's public API
 * does not have to change shape at all, only where it gets its data.
 */
export type ProjectKind =
  | "new_home"
  | "renovation"
  | "kitchen"
  | "bathroom"
  | "office"
  | "commercial"
  | "other";

export const PROJECT_KINDS: ProjectKind[] = [
  "new_home",
  "renovation",
  "kitchen",
  "bathroom",
  "office",
  "commercial",
  "other",
];

/** Written out rather than derived with `z.enum(PROJECT_KINDS as ...)`, so
    the literal union `z.enum` infers *is* `ProjectKind` and a kind added
    to the schema without adding it here is a type error at the route,
    not a value that clears validation and then throws deeper in
    `PROJECT_KIND_TO_DB`. The one schema is exported so every route under
    `api/v1/projects` validates a project kind the same way. */
export const ProjectKindSchema = z.enum([
  "new_home",
  "renovation",
  "kitchen",
  "bathroom",
  "office",
  "commercial",
  "other",
]);

export const TaskStatusSchema = z.enum(["todo", "doing", "done"]);
export const MaterialStatusSchema = z.enum(["planned", "ordered", "delivered"]);

/** A `Record` over the union, not a `switch` with a default: adding a kind
    to the schema without adding it here is a type error at build time,
    not a project that silently saves as `OTHER`. */
export const PROJECT_KIND_TO_DB: Record<ProjectKind, DbProjectKind> = {
  new_home: "NEW_HOME",
  renovation: "RENOVATION",
  kitchen: "KITCHEN",
  bathroom: "BATHROOM",
  office: "OFFICE",
  commercial: "COMMERCIAL",
  other: "OTHER",
};

export const PROJECT_KIND_FROM_DB: Record<DbProjectKind, ProjectKind> = {
  NEW_HOME: "new_home",
  RENOVATION: "renovation",
  KITCHEN: "kitchen",
  BATHROOM: "bathroom",
  OFFICE: "office",
  COMMERCIAL: "commercial",
  OTHER: "other",
};

export type TaskStatus = "todo" | "doing" | "done";

export const TASK_STATUS_TO_DB: Record<TaskStatus, DbTaskStatus> = {
  todo: "TODO",
  doing: "DOING",
  done: "DONE",
};

export const TASK_STATUS_FROM_DB: Record<DbTaskStatus, TaskStatus> = {
  TODO: "todo",
  DOING: "doing",
  DONE: "done",
};

export type MaterialStatus = "planned" | "ordered" | "delivered";

export const MATERIAL_STATUS_TO_DB: Record<MaterialStatus, DbMaterialStatus> = {
  planned: "PLANNED",
  ordered: "ORDERED",
  delivered: "DELIVERED",
};

export const MATERIAL_STATUS_FROM_DB: Record<DbMaterialStatus, MaterialStatus> = {
  PLANNED: "planned",
  ORDERED: "ordered",
  DELIVERED: "delivered",
};

/** ---- Calendar days --------------------------------------------------------
 * Five columns across these models are `@db.Date`
 * (`Project.startDate`/`targetDate`, `ProjectTask.dueDate`,
 * `ProjectMaterial.expectedOn`, `ProjectMilestone.date`) — calendar days in
 * the customer's head, not instants. The same reasoning as
 * `ConsultRequest.preferredDate` (`src/lib/types/consult.ts`) applies to
 * all five: construct at midnight UTC so the date component Postgres
 * stores is the day the customer typed, and read back by slicing the ISO
 * string rather than formatting in any local timezone, so the round trip
 * cannot shift a date east or west of UTC.
 */

const CALENDAR_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a string that is both shaped like `YYYY-MM-DD` *and* a
 * real calendar day. `Date`'s own parser normalises an out-of-range
 * component instead of rejecting it — `2026-02-30` silently becomes
 * 2 March — so the check re-serialises the parsed date and compares it
 * back against the input rather than trusting `getTime()` alone.
 */
export function isCalendarDay(value: string): boolean {
  if (!CALENDAR_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

/** `YYYY-MM-DD` → midnight UTC on that day, for writing to a `@db.Date`
    column. Callers are expected to have checked `isCalendarDay` already —
    this does not re-validate, so an invalid string lands wherever `Date`
    happens to normalise it. */
export function toCalendarDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** The inverse of `toCalendarDate` — a `@db.Date` column always comes back
    as midnight UTC, so slicing the ISO string recovers the day with no
    timezone arithmetic to get wrong. */
export function fromCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const zodDayIssue = "Enter a date as YYYY-MM-DD";

/** ---- Wire shapes ---------------------------------------------------------
 * Deliberately the same field names `src/lib/store/projects.tsx` already
 * uses, so the rewritten store's callers see the same `Project` shape they
 * do today. `documents` and `orders` are additive — the `localStorage`
 * version never had anywhere to put either — and live only on the detail
 * view, not the list, matching the two endpoints' documented scope.
 */

export interface ProjectTaskView {
  id: string;
  title: string;
  status: TaskStatus;
  phase: string | null;
  dueDate: string | null;
}

export interface ProjectMaterialView {
  id: string;
  title: string;
  qty: number;
  unit: string;
  unitPricePaise: Paise;
  status: MaterialStatus;
  productSlug: string | null;
  variantId: string | null;
  brand: string | null;
  expectedOn: string | null;
}

export interface ProjectMilestoneView {
  id: string;
  title: string;
  date: string;
  done: boolean;
}

export interface ProjectDocumentView {
  id: string;
  fileId: string;
  label: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ProjectOrderView {
  reference: string;
  status: string;
  totalPaise: Paise;
  createdAt: string;
}

export interface ProjectView {
  id: string;
  name: string;
  kind: ProjectKind;
  sizeSqft: number;
  location: string;
  budgetPaise: Paise;
  startDate: string | null;
  targetDate: string | null;
  requirements: string[];
  notes: string;
  isSample: boolean;
  archivedAt: string | null;
  createdAt: number;
  tasks: ProjectTaskView[];
  materials: ProjectMaterialView[];
  milestones: ProjectMilestoneView[];
}

export interface ProjectDetailView extends ProjectView {
  documents: ProjectDocumentView[];
  orders: ProjectOrderView[];
}

/** ---- Row → view -----------------------------------------------------------
 * One `select`/`include` shape shared between the list and the detail
 * read, so the two can never drift into returning different fields for
 * the same nested row.
 */

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  phase: true,
  dueDate: true,
} as const satisfies Prisma.ProjectTaskSelect;

const MATERIAL_SELECT = {
  id: true,
  title: true,
  qty: true,
  unit: true,
  unitPricePaise: true,
  status: true,
  productSlug: true,
  variantId: true,
  brand: true,
  expectedOn: true,
} as const satisfies Prisma.ProjectMaterialSelect;

const MILESTONE_SELECT = {
  id: true,
  title: true,
  date: true,
  done: true,
} as const satisfies Prisma.ProjectMilestoneSelect;

const PROJECT_SELECT = {
  id: true,
  name: true,
  kind: true,
  sizeSqft: true,
  location: true,
  budgetPaise: true,
  startDate: true,
  targetDate: true,
  requirements: true,
  notes: true,
  isSample: true,
  archivedAt: true,
  createdAt: true,
  tasks: { orderBy: { position: "asc" }, select: TASK_SELECT },
  materials: { orderBy: { createdAt: "asc" }, select: MATERIAL_SELECT },
  milestones: { orderBy: { date: "asc" }, select: MILESTONE_SELECT },
} as const satisfies Prisma.ProjectSelect;

const PROJECT_DETAIL_SELECT = {
  ...PROJECT_SELECT,
  documents: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileId: true,
      label: true,
      createdAt: true,
      file: { select: { originalName: true, contentType: true, sizeBytes: true } },
    },
  },
  orders: {
    orderBy: { createdAt: "desc" },
    select: {
      order: { select: { reference: true, status: true, totalPaise: true, createdAt: true } },
    },
  },
} as const satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;
type ProjectDetailRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_DETAIL_SELECT }>;

function taskToView(row: ProjectRow["tasks"][number]): ProjectTaskView {
  return {
    id: row.id,
    title: row.title,
    status: TASK_STATUS_FROM_DB[row.status],
    phase: row.phase,
    dueDate: row.dueDate ? fromCalendarDate(row.dueDate) : null,
  };
}

function materialToView(row: ProjectRow["materials"][number]): ProjectMaterialView {
  return {
    id: row.id,
    title: row.title,
    qty: row.qty,
    unit: row.unit,
    unitPricePaise: row.unitPricePaise,
    status: MATERIAL_STATUS_FROM_DB[row.status],
    productSlug: row.productSlug,
    variantId: row.variantId,
    brand: row.brand,
    expectedOn: row.expectedOn ? fromCalendarDate(row.expectedOn) : null,
  };
}

function milestoneToView(row: ProjectRow["milestones"][number]): ProjectMilestoneView {
  return {
    id: row.id,
    title: row.title,
    date: fromCalendarDate(row.date),
    done: row.done,
  };
}

function projectToView(row: ProjectRow): ProjectView {
  return {
    id: row.id,
    name: row.name,
    kind: PROJECT_KIND_FROM_DB[row.kind],
    sizeSqft: row.sizeSqft,
    location: row.location,
    budgetPaise: row.budgetPaise,
    startDate: row.startDate ? fromCalendarDate(row.startDate) : null,
    targetDate: row.targetDate ? fromCalendarDate(row.targetDate) : null,
    requirements: row.requirements,
    notes: row.notes,
    isSample: row.isSample,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.getTime(),
    tasks: row.tasks.map(taskToView),
    materials: row.materials.map(materialToView),
    milestones: row.milestones.map(milestoneToView),
  };
}

function projectDetailToView(row: ProjectDetailRow): ProjectDetailView {
  return {
    ...projectToView(row),
    documents: row.documents.map((d) => ({
      id: d.id,
      fileId: d.fileId,
      label: d.label,
      originalName: d.file.originalName,
      contentType: d.file.contentType,
      sizeBytes: d.file.sizeBytes,
      createdAt: d.createdAt.toISOString(),
    })),
    orders: row.orders.map((po) => ({
      reference: po.order.reference,
      status: po.order.status,
      totalPaise: po.order.totalPaise,
      createdAt: po.order.createdAt.toISOString(),
    })),
  };
}

/** ---- Reads ----------------------------------------------------------------- */

/**
 * The caller's own projects, newest first. Archived projects are excluded
 * unless `includeArchived` is set — the same "hide by default, but let a
 * customer who asks see it" shape `listOrdersForUser` and the address book
 * use for soft-hidden rows.
 */
export async function listProjectsForUser(
  userId: string,
  includeArchived = false,
): Promise<ProjectView[]> {
  const rows = await db.project.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "desc" },
    select: PROJECT_SELECT,
  });
  return rows.map(projectToView);
}

/**
 * One project, in full — but only when it belongs to `userId`. A project
 * that exists but belongs to someone else and one that does not exist at
 * all both resolve to `null` here, exactly as `getOrderForUser` treats a
 * reference that is not this customer's own.
 */
export async function getProjectForUser(
  userId: string,
  id: string,
): Promise<ProjectDetailView | null> {
  const row = await db.project.findFirst({
    where: { id, userId },
    select: PROJECT_DETAIL_SELECT,
  });
  return row ? projectDetailToView(row) : null;
}

/** ---- Writes: project itself ------------------------------------------------ */

export interface NewProjectInput {
  name: string;
  kind: ProjectKind;
  sizeSqft: number;
  location: string;
  budgetPaise: Paise;
  startDate?: string;
  targetDate?: string;
  requirements: string[];
}

export async function createProject(
  userId: string,
  input: NewProjectInput,
): Promise<ProjectView> {
  const row = await db.project.create({
    data: {
      userId,
      name: input.name,
      kind: PROJECT_KIND_TO_DB[input.kind],
      sizeSqft: input.sizeSqft,
      location: input.location,
      budgetPaise: input.budgetPaise,
      startDate: input.startDate ? toCalendarDate(input.startDate) : null,
      targetDate: input.targetDate ? toCalendarDate(input.targetDate) : null,
      requirements: input.requirements,
    },
    select: PROJECT_SELECT,
  });
  return projectToView(row);
}

export interface ProjectPatch {
  name?: string;
  kind?: ProjectKind;
  sizeSqft?: number;
  location?: string;
  budgetPaise?: Paise;
  /** `null` clears the date; `undefined` leaves it untouched. */
  startDate?: string | null;
  targetDate?: string | null;
  requirements?: string[];
  notes?: string;
  /** `true` archives (sets `archivedAt` if not already set), `false`
      unarchives (clears it). `undefined` leaves archive state alone. */
  archived?: boolean;
}

/** Thrown when the caller does not own (or there is no) row with that id —
    the route maps this to a 404, same shape whether the id is someone
    else's or simply invented. */
export class ProjectNotFoundError extends Error {
  constructor() {
    super("No such project");
  }
}

/**
 * Applies a patch, scoped to the owner in the write itself.
 *
 * `updateMany` rather than `update`, purely for the `where` guard: a
 * `Project.update` only accepts a unique `where` (`id` alone), which would
 * mean checking ownership with a `findFirst` first and updating by id
 * second — two queries with a window between them. `updateMany`'s `where`
 * has no such restriction, so `id` and `userId` are asserted in the same
 * statement that performs the write, and `count === 0` covers "does not
 * exist" and "exists but is not yours" identically.
 */
export async function updateProject(
  userId: string,
  id: string,
  patch: ProjectPatch,
): Promise<ProjectView> {
  const data: Prisma.ProjectUpdateManyMutationInput = {};

  if (patch.name !== undefined) data.name = patch.name;
  if (patch.kind !== undefined) data.kind = PROJECT_KIND_TO_DB[patch.kind];
  if (patch.sizeSqft !== undefined) data.sizeSqft = patch.sizeSqft;
  if (patch.location !== undefined) data.location = patch.location;
  if (patch.budgetPaise !== undefined) data.budgetPaise = patch.budgetPaise;
  if (patch.startDate !== undefined) {
    data.startDate = patch.startDate ? toCalendarDate(patch.startDate) : null;
  }
  if (patch.targetDate !== undefined) {
    data.targetDate = patch.targetDate ? toCalendarDate(patch.targetDate) : null;
  }
  if (patch.requirements !== undefined) data.requirements = patch.requirements;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.archived !== undefined) data.archivedAt = patch.archived ? new Date() : null;

  const claimed = await db.project.updateMany({ where: { id, userId }, data });
  if (claimed.count === 0) throw new ProjectNotFoundError();

  const row = await db.project.findFirstOrThrow({ where: { id, userId }, select: PROJECT_SELECT });
  return projectToView(row);
}

/** Real deletion, deliberately separate from archiving — see the model
    comment on `Project.archivedAt`. Returns whether a row was actually
    removed, so the route can 404 rather than pretend success on an id
    that was never the caller's. */
export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const claimed = await db.project.deleteMany({ where: { id, userId } });
  return claimed.count > 0;
}

/** ---- Writes: tasks ---------------------------------------------------------- */

export interface NewTaskInput {
  title: string;
  status?: TaskStatus;
  phase?: string;
  dueDate?: string;
}

/**
 * Verifies the project is the caller's before creating under it — a
 * `findFirst` ahead of the write, the same shape `createConsultRequest`
 * uses to resolve a slug to an id. Safe as a check-then-write here in a
 * way it would not be for a status transition: project ownership is not
 * something a second request could race this one into changing.
 */
async function requireOwnedProject(userId: string, projectId: string): Promise<void> {
  const project = await db.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) throw new ProjectNotFoundError();
}

export async function createTask(
  userId: string,
  projectId: string,
  input: NewTaskInput,
): Promise<ProjectTaskView> {
  await requireOwnedProject(userId, projectId);

  const last = await db.projectTask.findFirst({
    where: { projectId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const row = await db.projectTask.create({
    data: {
      projectId,
      title: input.title,
      status: TASK_STATUS_TO_DB[input.status ?? "todo"],
      phase: input.phase ?? null,
      dueDate: input.dueDate ? toCalendarDate(input.dueDate) : null,
      position: (last?.position ?? -1) + 1,
    },
    select: TASK_SELECT,
  });
  return taskToView(row);
}

export interface TaskPatch {
  title?: string;
  status?: TaskStatus;
  phase?: string | null;
  dueDate?: string | null;
}

/** Thrown when a task id does not resolve under the given project and
    owner — same 404 shape as `ProjectNotFoundError`, kept distinct only so
    a caller reading the code can tell which resource was missing. */
export class ProjectTaskNotFoundError extends Error {
  constructor() {
    super("No such task");
  }
}

export async function updateTask(
  userId: string,
  projectId: string,
  taskId: string,
  patch: TaskPatch,
): Promise<ProjectTaskView> {
  const data: Prisma.ProjectTaskUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.status !== undefined) data.status = TASK_STATUS_TO_DB[patch.status];
  if (patch.phase !== undefined) data.phase = patch.phase;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? toCalendarDate(patch.dueDate) : null;

  /* `project: { userId }` folds the ownership check into the same
     statement as the write and the "does this task belong to this
     project" check — see the file-level note on why a task id must be
     re-verified against the project id in the URL, not just against the
     caller's id. */
  const claimed = await db.projectTask.updateMany({
    where: { id: taskId, projectId, project: { userId } },
    data,
  });
  if (claimed.count === 0) throw new ProjectTaskNotFoundError();

  const row = await db.projectTask.findUniqueOrThrow({ where: { id: taskId }, select: TASK_SELECT });
  return taskToView(row);
}

export async function deleteTask(userId: string, projectId: string, taskId: string): Promise<boolean> {
  const claimed = await db.projectTask.deleteMany({
    where: { id: taskId, projectId, project: { userId } },
  });
  return claimed.count > 0;
}

/** ---- Writes: materials ------------------------------------------------------- */

export interface NewMaterialInput {
  title: string;
  qty: number;
  unit?: string;
  unitPricePaise?: Paise;
  status?: MaterialStatus;
  productSlug?: string;
  variantId?: string;
  brand?: string;
  expectedOn?: string;
}

export async function createMaterial(
  userId: string,
  projectId: string,
  input: NewMaterialInput,
): Promise<ProjectMaterialView> {
  await requireOwnedProject(userId, projectId);

  const row = await db.projectMaterial.create({
    data: {
      projectId,
      title: input.title,
      qty: input.qty,
      unit: input.unit ?? "",
      unitPricePaise: input.unitPricePaise ?? 0,
      status: MATERIAL_STATUS_TO_DB[input.status ?? "planned"],
      productSlug: input.productSlug ?? null,
      variantId: input.variantId ?? null,
      brand: input.brand ?? null,
      expectedOn: input.expectedOn ? toCalendarDate(input.expectedOn) : null,
    },
    select: MATERIAL_SELECT,
  });
  return materialToView(row);
}

export interface MaterialPatch {
  title?: string;
  qty?: number;
  unit?: string;
  unitPricePaise?: Paise;
  status?: MaterialStatus;
  productSlug?: string | null;
  variantId?: string | null;
  brand?: string | null;
  expectedOn?: string | null;
}

export class ProjectMaterialNotFoundError extends Error {
  constructor() {
    super("No such material");
  }
}

export async function updateMaterial(
  userId: string,
  projectId: string,
  materialId: string,
  patch: MaterialPatch,
): Promise<ProjectMaterialView> {
  const data: Prisma.ProjectMaterialUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  /* Never rounded — see the model comment on `ProjectMaterial.qty`. */
  if (patch.qty !== undefined) data.qty = patch.qty;
  if (patch.unit !== undefined) data.unit = patch.unit;
  if (patch.unitPricePaise !== undefined) data.unitPricePaise = patch.unitPricePaise;
  if (patch.status !== undefined) data.status = MATERIAL_STATUS_TO_DB[patch.status];
  if (patch.productSlug !== undefined) data.productSlug = patch.productSlug;
  if (patch.variantId !== undefined) data.variantId = patch.variantId;
  if (patch.brand !== undefined) data.brand = patch.brand;
  if (patch.expectedOn !== undefined) {
    data.expectedOn = patch.expectedOn ? toCalendarDate(patch.expectedOn) : null;
  }

  const claimed = await db.projectMaterial.updateMany({
    where: { id: materialId, projectId, project: { userId } },
    data,
  });
  if (claimed.count === 0) throw new ProjectMaterialNotFoundError();

  const row = await db.projectMaterial.findUniqueOrThrow({
    where: { id: materialId },
    select: MATERIAL_SELECT,
  });
  return materialToView(row);
}

export async function deleteMaterial(
  userId: string,
  projectId: string,
  materialId: string,
): Promise<boolean> {
  const claimed = await db.projectMaterial.deleteMany({
    where: { id: materialId, projectId, project: { userId } },
  });
  return claimed.count > 0;
}

/** ---- Writes: milestones ------------------------------------------------------ */

export interface NewMilestoneInput {
  title: string;
  date: string;
  done?: boolean;
}

export async function createMilestone(
  userId: string,
  projectId: string,
  input: NewMilestoneInput,
): Promise<ProjectMilestoneView> {
  await requireOwnedProject(userId, projectId);

  const row = await db.projectMilestone.create({
    data: {
      projectId,
      title: input.title,
      date: toCalendarDate(input.date),
      done: input.done ?? false,
    },
    select: MILESTONE_SELECT,
  });
  return milestoneToView(row);
}

export interface MilestonePatch {
  title?: string;
  date?: string;
  done?: boolean;
}

export class ProjectMilestoneNotFoundError extends Error {
  constructor() {
    super("No such milestone");
  }
}

export async function updateMilestone(
  userId: string,
  projectId: string,
  milestoneId: string,
  patch: MilestonePatch,
): Promise<ProjectMilestoneView> {
  const data: Prisma.ProjectMilestoneUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.date !== undefined) data.date = toCalendarDate(patch.date);
  if (patch.done !== undefined) data.done = patch.done;

  const claimed = await db.projectMilestone.updateMany({
    where: { id: milestoneId, projectId, project: { userId } },
    data,
  });
  if (claimed.count === 0) throw new ProjectMilestoneNotFoundError();

  const row = await db.projectMilestone.findUniqueOrThrow({
    where: { id: milestoneId },
    select: MILESTONE_SELECT,
  });
  return milestoneToView(row);
}

export async function deleteMilestone(
  userId: string,
  projectId: string,
  milestoneId: string,
): Promise<boolean> {
  const claimed = await db.projectMilestone.deleteMany({
    where: { id: milestoneId, projectId, project: { userId } },
  });
  return claimed.count > 0;
}

/** ---- Writes: linked orders ---------------------------------------------------
 * `ProjectOrder.orderId` is an internal id, never shown to a customer —
 * `Order.reference` is what they actually have (it is what
 * `/account/orders` shows, and what `getOrderForUser` keys on). So linking
 * and unlinking both take a `reference` and resolve it to the internal id
 * themselves, the same way `createConsultRequest` resolves an
 * `areaSlug`/`categorySlug` rather than trusting a caller-supplied
 * relation id.
 */

export class ProjectOrderLinkNotFoundError extends Error {
  constructor() {
    super("No such order");
  }
}

export class ProjectOrderAlreadyLinkedError extends Error {
  constructor() {
    super("That order is already linked to this project");
  }
}

/**
 * Links an order to a project. Both ownership checks matter: the project
 * must be this caller's (checked first, so a stranger's project id 404s
 * before anything about the order is revealed), and — the check this
 * function exists for — the order must *also* be this caller's, or anyone
 * could file a stranger's order under their own project and read its
 * lines back through the project view.
 */
export async function linkOrder(
  userId: string,
  projectId: string,
  reference: string,
): Promise<ProjectOrderView> {
  await requireOwnedProject(userId, projectId);

  const order = await db.order.findFirst({
    where: { reference, userId },
    select: { id: true, reference: true, status: true, totalPaise: true, createdAt: true },
  });
  if (!order) throw new ProjectOrderLinkNotFoundError();

  try {
    await db.projectOrder.create({ data: { projectId, orderId: order.id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ProjectOrderAlreadyLinkedError();
    }
    throw error;
  }

  return {
    reference: order.reference,
    status: order.status,
    totalPaise: order.totalPaise,
    createdAt: order.createdAt.toISOString(),
  };
}

export async function unlinkOrder(
  userId: string,
  projectId: string,
  reference: string,
): Promise<boolean> {
  const claimed = await db.projectOrder.deleteMany({
    where: { projectId, project: { userId }, order: { reference } },
  });
  return claimed.count > 0;
}

/** ---- Writes: documents ---------------------------------------------------------
 * Same shape as linking an order: the file id is caller-supplied, and is
 * trusted for nothing beyond being looked up — it must resolve to a
 * `StoredFile` this same user owns and that has actually finished
 * uploading, exactly as `GET /api/v1/uploads/{id}` requires before
 * issuing a download URL.
 */

export class ProjectDocumentFileNotFoundError extends Error {
  constructor() {
    super("No such file");
  }
}

export class ProjectDocumentAlreadyAttachedError extends Error {
  constructor() {
    super("That file is already attached to this project");
  }
}

export async function attachDocument(
  userId: string,
  projectId: string,
  fileId: string,
  label?: string,
): Promise<ProjectDocumentView> {
  await requireOwnedProject(userId, projectId);

  /* `status: "STORED"` rules out a `PENDING` upload nobody finished and an
     `ABANDONED` one whose bytes never matched what was declared — see
     `POST /api/v1/uploads/{id}/confirm`. Attaching either would give the
     project a document row pointing at nothing. */
  const file = await db.storedFile.findFirst({
    where: { id: fileId, userId, status: "STORED" },
    select: { id: true, originalName: true, contentType: true, sizeBytes: true },
  });
  if (!file) throw new ProjectDocumentFileNotFoundError();

  let row;
  try {
    row = await db.projectDocument.create({
      data: { projectId, fileId, label: label ?? "" },
      select: { id: true, fileId: true, label: true, createdAt: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ProjectDocumentAlreadyAttachedError();
    }
    throw error;
  }

  return {
    id: row.id,
    fileId: row.fileId,
    label: row.label,
    originalName: file.originalName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function detachDocument(
  userId: string,
  projectId: string,
  fileId: string,
): Promise<boolean> {
  const claimed = await db.projectDocument.deleteMany({
    where: { projectId, fileId, project: { userId } },
  });
  return claimed.count > 0;
}

/** Re-exported so route handlers can build a single zod issue message
    without duplicating the copy. */
export const CALENDAR_DAY_MESSAGE = zodDayIssue;
