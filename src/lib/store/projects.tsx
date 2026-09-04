"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  createPersistentStore,
  usePersistentStore,
} from "@/lib/store/persistent";
import { useHydrated } from "@/lib/store/hydrated";
import type { Paise } from "@/lib/types/catalog";

/**
 * Projects.
 *
 * A renovation is not a basket of orders; it is one thing that runs for
 * months and accumulates orders, bookings, quotes, drawings and a budget.
 * Modelling it as its own object — rather than tagging orders with a
 * string — is what makes the budget arithmetic, the delivery calendar and
 * the material list possible at all.
 *
 * Held in the browser for now, and shaped so it does not have to be. Every
 * mutation below is a whole-object replace keyed by id, which is exactly
 * what a `PATCH /api/v1/projects/:id` will do; nothing here relies on
 * shared mutable state or on the order effects happen to run in.
 *
 * Money is paise, integer, like everywhere else in the app.
 */

const EMPTY: Project[] = [];
const store = createPersistentStore<Project[]>("projects", 1, EMPTY);

export type ProjectKind =
  | "new_home"
  | "renovation"
  | "kitchen"
  | "bathroom"
  | "office"
  | "commercial"
  | "other";

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  new_home: "New home",
  renovation: "Renovation",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  office: "Office",
  commercial: "Commercial",
  other: "Something else",
};

export type TaskStatus = "todo" | "doing" | "done";
export type MaterialStatus = "planned" | "ordered" | "delivered";

export interface ProjectTask {
  id: string;
  title: string;
  status: TaskStatus;
  /** Which stage of the build this belongs to, e.g. "Civil work". */
  phase?: string;
  /** ISO date, `YYYY-MM-DD`. */
  dueDate?: string;
}

export interface ProjectMaterial {
  id: string;
  title: string;
  qty: number;
  /** Free text: "bags", "sq.ft.", "L" — mirrors the catalogue's units. */
  unit: string;
  unitPricePaise: Paise;
  status: MaterialStatus;
  /** Set when the line came from the catalogue rather than being typed. */
  productSlug?: string;
  brand?: string;
  /** ISO date the delivery is expected, when one is scheduled. */
  expectedOn?: string;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  /** ISO date. */
  date: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  /** Built-up area in square feet. Zero when the customer skipped it. */
  sizeSqft: number;
  location: string;
  budgetPaise: Paise;
  /** ISO dates. */
  startDate: string;
  targetDate: string;
  createdAt: number;
  /** Free-form scope chosen during onboarding, e.g. "Flooring". */
  requirements: string[];
  tasks: ProjectTask[];
  materials: ProjectMaterial[];
  milestones: ProjectMilestone[];
  notes: string;
  /** True for the worked example offered from the empty state. */
  isSample?: boolean;
}

interface ProjectsApi {
  projects: Project[];
  ready: boolean;
  get: (id: string) => Project | undefined;
  create: (draft: NewProject) => Project;
  update: (id: string, patch: Partial<Omit<Project, "id">>) => void;
  remove: (id: string) => void;
  addMaterial: (id: string, material: Omit<ProjectMaterial, "id">) => void;
  setTaskStatus: (id: string, taskId: string, status: TaskStatus) => void;
  addTask: (id: string, task: Omit<ProjectTask, "id">) => void;
}

export type NewProject = Pick<
  Project,
  | "name"
  | "kind"
  | "sizeSqft"
  | "location"
  | "budgetPaise"
  | "startDate"
  | "targetDate"
  | "requirements"
>;

const ProjectsContext = createContext<ProjectsApi | null>(null);

/**
 * Ids are generated here rather than by the caller so that the eventual
 * server can hand back its own without any component caring. `randomUUID`
 * where it exists, and a timestamp-plus-random fallback for the older
 * Safari versions that still reach this app over http on a site network.
 */
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = usePersistentStore(store);
  const ready = useHydrated();

  const patch = useCallback(
    (id: string, fn: (p: Project) => Project) => {
      setProjects((current) => current.map((p) => (p.id === id ? fn(p) : p)));
    },
    [setProjects],
  );

  const api = useMemo<ProjectsApi>(
    () => ({
      projects,
      ready,
      get: (id) => projects.find((p) => p.id === id),

      create: (draft) => {
        const project: Project = {
          ...draft,
          id: newId(),
          createdAt: Date.now(),
          tasks: startingTasks(draft),
          materials: [],
          milestones: [],
          notes: "",
        };
        setProjects((current) => [project, ...current]);
        return project;
      },

      update: (id, changes) => patch(id, (p) => ({ ...p, ...changes })),

      remove: (id) =>
        setProjects((current) => current.filter((p) => p.id !== id)),

      addMaterial: (id, material) =>
        patch(id, (p) => ({
          ...p,
          materials: [...p.materials, { ...material, id: newId() }],
        })),

      addTask: (id, task) =>
        patch(id, (p) => ({
          ...p,
          tasks: [...p.tasks, { ...task, id: newId() }],
        })),

      setTaskStatus: (id, taskId, status) =>
        patch(id, (p) => ({
          ...p,
          tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
        })),
    }),
    [projects, ready, patch, setProjects],
  );

  return (
    <ProjectsContext.Provider value={api}>{children}</ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsApi {
  const api = useContext(ProjectsContext);
  if (!api) throw new Error("useProjects must be used inside <ProjectsProvider>");
  return api;
}

/**
 * A new project is not born empty.
 *
 * Every requirement the customer picked during onboarding becomes a task,
 * because a dashboard whose task list is blank on day one teaches people
 * that the dashboard is decorative. These are ordinary tasks they can
 * rename or delete — a starting point, not a template they are stuck in.
 */
function startingTasks(draft: NewProject): ProjectTask[] {
  const base: Omit<ProjectTask, "id">[] = [
    { title: "Confirm scope and drawings", status: "todo", phase: "Planning" },
    { title: "Set the working budget", status: "done", phase: "Planning" },
  ];
  const fromRequirements = draft.requirements.map((r) => ({
    title: `Plan ${r.toLowerCase()}`,
    status: "todo" as TaskStatus,
    phase: r,
  }));
  return [...base, ...fromRequirements].map((t) => ({ ...t, id: newId() }));
}

/* --------------------------------------------------------------- derived */

/**
 * What a project's numbers actually are.
 *
 * Derived on read rather than stored, so a material added anywhere in the
 * app cannot leave a stale "spent" figure behind it. Cheap at project
 * sizes — a few dozen lines — and the alternative is two sources of truth
 * for money.
 */
export interface ProjectSummary {
  budgetPaise: Paise;
  /** Committed: ordered and delivered lines, not what is merely planned. */
  spentPaise: Paise;
  /** Priced but not yet ordered. Shown separately so it is not "spent". */
  plannedPaise: Paise;
  remainingPaise: Paise;
  /** 0–100, from completed tasks. Null when there are no tasks to count. */
  progressPct: number | null;
  tasksDone: number;
  tasksTotal: number;
  /** Deliveries with a date in the future, soonest first. */
  upcoming: ProjectMaterial[];
  overBudget: boolean;
}

export function summarise(project: Project): ProjectSummary {
  const value = (m: ProjectMaterial) => m.unitPricePaise * m.qty;

  const spentPaise = project.materials
    .filter((m) => m.status !== "planned")
    .reduce((sum, m) => sum + value(m), 0);
  const plannedPaise = project.materials
    .filter((m) => m.status === "planned")
    .reduce((sum, m) => sum + value(m), 0);

  const tasksTotal = project.tasks.length;
  const tasksDone = project.tasks.filter((t) => t.status === "done").length;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = project.materials
    .filter((m) => m.expectedOn && m.expectedOn >= today && m.status === "ordered")
    .sort((a, b) => (a.expectedOn ?? "").localeCompare(b.expectedOn ?? ""));

  return {
    budgetPaise: project.budgetPaise,
    spentPaise,
    plannedPaise,
    /* Can go negative, and is shown negative rather than clamped to zero.
       A budget that quietly bottoms out at ₹0 hides the one number the
       customer most needs to see. */
    remainingPaise: project.budgetPaise - spentPaise,
    progressPct: tasksTotal === 0 ? null : Math.round((tasksDone / tasksTotal) * 100),
    tasksDone,
    tasksTotal,
    upcoming,
    overBudget: spentPaise > project.budgetPaise,
  };
}
