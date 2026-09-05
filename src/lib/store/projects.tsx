"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { readStore, writeStore, clearStore } from "@/lib/store/storage";
import type {
  ProjectKind,
  TaskStatus,
  MaterialStatus,
  ProjectView,
  ProjectTaskView,
  ProjectMaterialView,
  ProjectMilestoneView,
  ProjectDetailView,
  NewProjectInput,
  NewTaskInput,
  NewMaterialInput,
  NewMilestoneInput,
  ProjectPatch,
} from "@/lib/data/projects";

/**
 * Projects.
 *
 * A renovation is not a basket of orders; it is one thing that runs for
 * months and accumulates orders, bookings, quotes, drawings and a budget.
 * Modelling it as its own object — rather than tagging orders with a
 * string — is what makes the budget arithmetic, the delivery calendar and
 * the material list possible at all.
 *
 * This used to be `localStorage` only, shaped as whole-object replaces
 * keyed by id so that pointing it at an account was a change of
 * implementation, not a rewrite of every page. This is that change:
 * `src/lib/data/projects.ts` is the server side, and every mutation below
 * is now a `fetch` against `/api/v1/projects`, but the public shape —
 * `projects`, `ready`, `get`, `create`, `update`, `remove`, `addMaterial`,
 * `addTask`, `setTaskStatus` — is the same one `ProjectList`,
 * `ProjectDashboard` and `ProjectWizard` already called.
 *
 * Only *types* are imported from `@/lib/data/projects`, never its runtime
 * exports: that module pulls in `@/lib/db` (Prisma), and a value import
 * here would drag Prisma into the browser bundle. `import type` is erased
 * at compile time (`isolatedModules` in `tsconfig.json` enforces this), so
 * it costs nothing and cannot leak a server-only dependency. The API
 * already speaks the client's own vocabulary on the wire — `kind` arrives
 * as `new_home`, task status as `todo`/`doing`/`done` — so there is no
 * uppercase/lowercase conversion to duplicate here at all; the server owns
 * that mapping at its own boundary.
 *
 * Money is paise, integer, like everywhere else in the app.
 */

export type { ProjectKind, TaskStatus, MaterialStatus };
export type ProjectTask = ProjectTaskView;
export type ProjectMaterial = ProjectMaterialView;
export type ProjectMilestone = ProjectMilestoneView;
/** The richer, single-project shape (adds `documents`/`orders`). List rows
    are widened to this with empty arrays — see `withDetailDefaults` — so
    the store has one `Project` type rather than a list/detail split that
    would ripple through every consumer for two fields nothing renders
    yet. */
export type Project = ProjectDetailView;
export type NewProject = NewProjectInput;

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  new_home: "New home",
  renovation: "Renovation",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  office: "Office",
  commercial: "Commercial",
  other: "Something else",
};

interface ProjectsApi {
  projects: Project[];
  /** True once the initial fetch has settled — successfully, as "signed
      out", or as a failure. A network round trip replaces what used to be
      a synchronous `localStorage` read, so this now means "fetched", not
      "hydrated". */
  ready: boolean;
  /** Set only when the initial list load itself failed (not "signed
      out", which is a normal empty state, not an error). `refresh` retries
      it. */
  error: string | null;
  get: (id: string) => Project | undefined;
  create: (draft: NewProject) => Promise<Project>;
  update: (id: string, patch: ProjectPatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addMaterial: (id: string, material: NewMaterialInput) => Promise<void>;
  addTask: (id: string, task: NewTaskInput) => Promise<void>;
  setTaskStatus: (id: string, taskId: string, status: TaskStatus) => Promise<void>;
  refresh: () => void;
  /** The offer to import whatever this browser had in `localStorage`
      before projects moved to the account. See the file-level comment on
      `LocalImport` below for why this is a count, not the raw rows. */
  localImport: LocalImport;
}

export interface LocalImport {
  /** Number of legacy projects still waiting on a decision; `null` means
      there is nothing to offer — either none exist, or this browser
      already accepted or declined. */
  pending: number | null;
  busy: boolean;
  error: string | null;
  accept: () => Promise<void>;
  decline: () => void;
}

const ProjectsContext = createContext<ProjectsApi | null>(null);

export function useProjects(): ProjectsApi {
  const api = useContext(ProjectsContext);
  if (!api) throw new Error("useProjects must be used inside <ProjectsProvider>");
  return api;
}

/* ------------------------------------------------------------ transport */

/**
 * Thrown for any non-2xx response, carrying the status so callers can
 * tell "not signed in" (401 — a normal state, not a failure) apart from
 * everything else (a real failure, worth an `InlineError` and a retry).
 */
export class ProjectsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProjectsRequestError";
  }
}

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });

  /* A 204 or a body that is not JSON at all (a proxy's error page, a
     dropped connection) must not throw out of `.json()` and mask the real
     "request failed" signal with a parse error instead. */
  const body: { data?: T; error?: { message?: string } } | null = await res
    .json()
    .catch(() => null);

  if (!res.ok) {
    throw new ProjectsRequestError(body?.error?.message ?? GENERIC_MESSAGE, res.status);
  }
  return body?.data as T;
}

const getJson = <T,>(url: string) => request<T>(url);
const postJson = <T,>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", body: JSON.stringify(body ?? {}) });
const patchJson = <T,>(url: string, body: unknown) =>
  request<T>(url, { method: "PATCH", body: JSON.stringify(body ?? {}) });
const deleteJson = <T,>(url: string) => request<T>(url, { method: "DELETE" });

function withDetailDefaults(project: ProjectView): Project {
  return { ...project, documents: [], orders: [] };
}

/* ------------------------------------------------------- local import */

/**
 * The pre-account data.
 *
 * Projects used to be `localStorage` only, under the same `quoin:projects`
 * key `createPersistentStore` wrote (see `src/lib/store/storage.ts`). That
 * data was never structured against this store's server types — it is
 * whatever the old optional-field shape happened to be — so it is parsed
 * defensively rather than trusted, the same "a shape that does not match
 * is discarded, not migrated" rule `storage.ts` already documents for a
 * version mismatch.
 */
interface LegacyTask {
  id: string;
  title: string;
  status: TaskStatus;
  phase?: string;
  dueDate?: string;
}

interface LegacyMaterial {
  id: string;
  title: string;
  qty: number;
  unit: string;
  unitPricePaise: number;
  status: MaterialStatus;
  productSlug?: string;
  brand?: string;
  expectedOn?: string;
}

interface LegacyMilestone {
  id: string;
  title: string;
  date: string;
  done: boolean;
}

interface LegacyProject {
  id: string;
  name: string;
  kind: ProjectKind;
  sizeSqft: number;
  location: string;
  budgetPaise: number;
  startDate: string;
  targetDate: string;
  requirements: string[];
  tasks: LegacyTask[];
  materials: LegacyMaterial[];
  milestones: LegacyMilestone[];
  notes: string;
}

const KNOWN_KINDS = new Set<string>([
  "new_home",
  "renovation",
  "kitchen",
  "bathroom",
  "office",
  "commercial",
  "other",
]);

/** A loose runtime guard, not a full schema — good enough to keep a
    corrupted or hand-edited `localStorage` entry from crashing the import
    rather than to validate every field the server itself will check. */
export function isLegacyProject(value: unknown): value is LegacyProject {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.kind === "string" &&
    KNOWN_KINDS.has(p.kind) &&
    Array.isArray(p.tasks) &&
    Array.isArray(p.materials) &&
    Array.isArray(p.milestones)
  );
}

const LOCAL_PROJECTS_KEY = "projects";
const LOCAL_PROJECTS_VERSION = 1;
const IMPORT_DECISION_KEY = "projects-import-decision";
const IMPORT_DECISION_VERSION = 1;

function readLegacyProjects(): LegacyProject[] {
  return readStore<unknown[]>(LOCAL_PROJECTS_KEY, LOCAL_PROJECTS_VERSION, []).filter(
    isLegacyProject,
  );
}

/** Pure so the "offer, or stay quiet" decision is unit-testable without a
    browser: true only when there is something to offer and this browser
    has not already answered once. Asking again after a decline would turn
    "one clear prompt" into a nag on every visit. */
export function shouldOfferLocalImport(legacyCount: number, alreadyDecided: boolean): boolean {
  return legacyCount > 0 && !alreadyDecided;
}

/**
 * Recreates one legacy project on the server, in full — the project
 * itself, its notes, then every task, material and milestone as a
 * follow-up write, mirroring exactly what `create` below does for a
 * brand-new project (see its comment on why seeding is a client-side
 * loop rather than something `POST /api/v1/projects` does itself).
 */
async function importLegacyProject(legacy: LegacyProject): Promise<Project> {
  const { project: created } = await postJson<{ project: ProjectView }>("/api/v1/projects", {
    name: legacy.name,
    kind: legacy.kind,
    sizeSqft: legacy.sizeSqft,
    location: legacy.location,
    budgetPaise: legacy.budgetPaise,
    startDate: legacy.startDate || undefined,
    targetDate: legacy.targetDate || undefined,
    requirements: legacy.requirements ?? [],
  } satisfies NewProjectInput);

  let project = created;
  if (legacy.notes) {
    const patched = await patchJson<{ project: ProjectView }>(
      `/api/v1/projects/${project.id}`,
      { notes: legacy.notes } satisfies ProjectPatch,
    );
    project = patched.project;
  }

  const tasks: ProjectTaskView[] = [];
  for (const t of legacy.tasks) {
    const { task } = await postJson<{ task: ProjectTaskView }>(
      `/api/v1/projects/${project.id}/tasks`,
      { title: t.title, status: t.status, phase: t.phase, dueDate: t.dueDate } satisfies NewTaskInput,
    );
    tasks.push(task);
  }

  const materials: ProjectMaterialView[] = [];
  for (const m of legacy.materials) {
    const { material } = await postJson<{ material: ProjectMaterialView }>(
      `/api/v1/projects/${project.id}/materials`,
      {
        title: m.title,
        qty: m.qty,
        unit: m.unit,
        unitPricePaise: m.unitPricePaise,
        status: m.status,
        productSlug: m.productSlug,
        brand: m.brand,
        expectedOn: m.expectedOn,
      } satisfies NewMaterialInput,
    );
    materials.push(material);
  }

  const milestones: ProjectMilestoneView[] = [];
  for (const ms of legacy.milestones) {
    const { milestone } = await postJson<{ milestone: ProjectMilestoneView }>(
      `/api/v1/projects/${project.id}/milestones`,
      { title: ms.title, date: ms.date, done: ms.done } satisfies NewMilestoneInput,
    );
    milestones.push(milestone);
  }

  return { ...project, tasks, materials, milestones, documents: [], orders: [] };
}

/* --------------------------------------------------------------- tasks */

/**
 * A new project is not born empty.
 *
 * Every requirement the customer picked during onboarding becomes a task,
 * because a dashboard whose task list is blank on day one teaches people
 * that the dashboard is decorative. `POST /api/v1/projects` deliberately
 * does not do this itself — it is UI convenience, not something every API
 * caller wants — so it stays here as a client-side seed: a plain starting
 * list, posted one `POST .../tasks` at a time once the project exists.
 */
export function startingTaskSeeds(draft: NewProject): NewTaskInput[] {
  const base: NewTaskInput[] = [
    { title: "Confirm scope and drawings", status: "todo", phase: "Planning" },
    { title: "Set the working budget", status: "done", phase: "Planning" },
  ];
  const fromRequirements = draft.requirements.map((r) => ({
    title: `Plan ${r.toLowerCase()}`,
    status: "todo" as TaskStatus,
    phase: r,
  }));
  return [...base, ...fromRequirements];
}

/* ---------------------------------------------------------------- provider */

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [localPending, setLocalPending] = useState<LegacyProject[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  /* `reloadToken` is what makes `refresh()` re-run this: bumping it is the
     only thing the callback does, and the effect below depends on it. That
     — rather than calling an async function straight from the effect body
     — is also what keeps this off the `set-state-in-effect` rule: every
     `setState` here happens inside the IIFE, after an `await`, guarded by
     `ignore`, the same shape `AddressPicker` and `CheckoutFlow` already
     fetch against `/api/v1` with. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let ignore = false;

    (async () => {
      setError(null);
      try {
        const { projects: list } = await getJson<{ projects: ProjectView[] }>("/api/v1/projects");
        if (ignore) return;
        setProjects(list.map(withDetailDefaults));
        setReady(true);

        const decided = readStore<boolean>(IMPORT_DECISION_KEY, IMPORT_DECISION_VERSION, false);
        const legacy = readLegacyProjects();
        setLocalPending(shouldOfferLocalImport(legacy.length, decided) ? legacy : null);
      } catch (err) {
        if (ignore) return;
        /* Signed out is this store's normal empty state, not a failure —
           `/projects` itself gates on the session server-side and shows
           `SignInPrompt` instead of ever mounting this list, but the
           provider is mounted for the whole app (see `AppProviders`), so
           it still has to answer sensibly for the pages that read it
           without that gate. */
        if (err instanceof ProjectsRequestError && err.status === 401) {
          setProjects([]);
          setLocalPending(null);
        } else {
          setError(err instanceof Error ? err.message : GENERIC_MESSAGE);
        }
        setReady(true);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  const get = useCallback((id: string) => projects.find((p) => p.id === id), [projects]);

  const create = useCallback(async (draft: NewProject): Promise<Project> => {
    const { project } = await postJson<{ project: ProjectView }>("/api/v1/projects", draft);

    const tasks: ProjectTaskView[] = [];
    for (const seed of startingTaskSeeds(draft)) {
      try {
        const { task } = await postJson<{ task: ProjectTaskView }>(
          `/api/v1/projects/${project.id}/tasks`,
          seed,
        );
        tasks.push(task);
      } catch {
        /* Best-effort: these are a UX nicety generated on the client's
           behalf, not an edit the customer made. A seed task that fails
           to write must not fail the project it would have belonged to. */
      }
    }

    const full: Project = { ...project, tasks, materials: [], milestones: [], documents: [], orders: [] };
    setProjects((current) => [full, ...current]);
    return full;
  }, []);

  const update = useCallback(async (id: string, patch: ProjectPatch): Promise<void> => {
    const { project } = await patchJson<{ project: ProjectView }>(`/api/v1/projects/${id}`, patch);
    setProjects((current) =>
      current.map((p) => (p.id === id ? { ...p, ...project } : p)),
    );
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    /* Pessimistic on purpose: the local list only drops the project once
       the server confirms it is gone, so a failed delete leaves the
       dashboard exactly as it was rather than showing a project that
       still exists on a screen that no longer offers it. */
    await deleteJson(`/api/v1/projects/${id}`);
    setProjects((current) => current.filter((p) => p.id !== id));
  }, []);

  const addMaterial = useCallback(async (id: string, material: NewMaterialInput): Promise<void> => {
    const { material: created } = await postJson<{ material: ProjectMaterialView }>(
      `/api/v1/projects/${id}/materials`,
      material,
    );
    setProjects((current) =>
      current.map((p) => (p.id === id ? { ...p, materials: [...p.materials, created] } : p)),
    );
  }, []);

  const addTask = useCallback(async (id: string, task: NewTaskInput): Promise<void> => {
    const { task: created } = await postJson<{ task: ProjectTaskView }>(
      `/api/v1/projects/${id}/tasks`,
      task,
    );
    setProjects((current) =>
      current.map((p) => (p.id === id ? { ...p, tasks: [...p.tasks, created] } : p)),
    );
  }, []);

  const setTaskStatus = useCallback(
    async (id: string, taskId: string, status: TaskStatus): Promise<void> => {
      /* Optimistic, unlike the others: a checkbox has to feel instant, and
         reverting the one row that failed is cheap and visible, unlike a
         silently-lost edit. */
      let previous: TaskStatus | undefined;
      setProjects((current) =>
        current.map((p) => {
          if (p.id !== id) return p;
          return {
            ...p,
            tasks: p.tasks.map((t) => {
              if (t.id !== taskId) return t;
              previous = t.status;
              return { ...t, status };
            }),
          };
        }),
      );

      try {
        await patchJson(`/api/v1/projects/${id}/tasks/${taskId}`, { status });
      } catch (err) {
        setProjects((current) =>
          current.map((p) => {
            if (p.id !== id) return p;
            return {
              ...p,
              tasks: p.tasks.map((t) =>
                t.id === taskId && previous !== undefined ? { ...t, status: previous } : t,
              ),
            };
          }),
        );
        throw err;
      }
    },
    [],
  );

  const acceptLocalImport = useCallback(async (): Promise<void> => {
    setImportBusy(true);
    setImportError(null);
    try {
      /* Re-read rather than trust `localPending`: shrinking this list and
         writing it back after every success (below) is what makes a retry
         after a partial failure safe — it only re-attempts what is
         genuinely still local, instead of recreating a project a previous
         attempt already got onto the server. */
      let remaining = readLegacyProjects();
      while (remaining.length > 0) {
        const [next, ...rest] = remaining;
        const imported = await importLegacyProject(next);
        setProjects((current) => [imported, ...current]);
        remaining = rest;
        writeStore(LOCAL_PROJECTS_KEY, LOCAL_PROJECTS_VERSION, remaining);
      }
      /* Only cleared once nothing remains — i.e. the server has confirmed
         every one of them — never before, and never just because the
         request that started this was accepted. */
      clearStore(LOCAL_PROJECTS_KEY);
      writeStore(IMPORT_DECISION_KEY, IMPORT_DECISION_VERSION, true);
      setLocalPending(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : GENERIC_MESSAGE);
      setLocalPending(readLegacyProjects());
    } finally {
      setImportBusy(false);
    }
  }, []);

  const declineLocalImport = useCallback(() => {
    /* Declining leaves the local copy exactly where it was — "silently
       discarding them" is exactly the outcome this store must not
       produce. It only records that this browser was asked, so the
       prompt does not return on every visit. */
    writeStore(IMPORT_DECISION_KEY, IMPORT_DECISION_VERSION, true);
    setLocalPending(null);
  }, []);

  const localImport: LocalImport = useMemo(
    () => ({
      pending: localPending ? localPending.length : null,
      busy: importBusy,
      error: importError,
      accept: acceptLocalImport,
      decline: declineLocalImport,
    }),
    [localPending, importBusy, importError, acceptLocalImport, declineLocalImport],
  );

  const api = useMemo<ProjectsApi>(
    () => ({
      projects,
      ready,
      error,
      get,
      create,
      update,
      remove,
      addMaterial,
      addTask,
      setTaskStatus,
      refresh,
      localImport,
    }),
    [projects, ready, error, get, create, update, remove, addMaterial, addTask, setTaskStatus, refresh, localImport],
  );

  return (
    <ProjectsContext.Provider value={api}>{children}</ProjectsContext.Provider>
  );
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
  budgetPaise: number;
  /** Committed: ordered and delivered lines, not what is merely planned. */
  spentPaise: number;
  /** Priced but not yet ordered. Shown separately so it is not "spent". */
  plannedPaise: number;
  remainingPaise: number;
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
