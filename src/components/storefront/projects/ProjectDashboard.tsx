"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Stat";
import { Progress } from "@/components/ui/Progress";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState, InlineError } from "@/components/ui/ErrorState";
import { ListSkeleton, StatRowSkeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { BudgetBar } from "@/components/storefront/projects/BudgetBar";
import { Timeline } from "@/components/storefront/projects/Timeline";
import { cn } from "@/components/ui/cn";
import {
  ArrowRight,
  Briefcase,
  CheckCircle,
  Document,
  Layers,
  Package,
  Pin,
  Plus,
  Rupee,
  Trash,
  Truck,
} from "@/components/icons";
import {
  PROJECT_KIND_LABEL,
  summarise,
  useProjects,
  type MaterialStatus,
  type Project,
  type TaskStatus,
} from "@/lib/store/projects";
import { formatPrice } from "@/lib/types/catalog";

/**
 * One project, as a dashboard.
 *
 * The sections are tabs rather than a long scroll, because eight sections
 * stacked is a page nobody reaches the bottom of, and the thing a customer
 * opens this for — "how much is left" — has to be above the fold every
 * time. Overview carries the three figures that answer that; the rest is
 * one tap away.
 *
 * Every number is derived from the project's own materials and tasks by
 * `summarise`, never stored. A budget with its own "spent" column is a
 * budget that drifts from the lines that made it.
 */

type SectionId =
  | "overview"
  | "materials"
  | "budget"
  | "tasks"
  | "services"
  | "deliveries"
  | "documents"
  | "notes";

const SECTIONS: TabItem<SectionId>[] = [
  { id: "overview", label: "Overview" },
  { id: "materials", label: "Materials" },
  { id: "budget", label: "Budget" },
  { id: "tasks", label: "Tasks" },
  { id: "services", label: "Services" },
  { id: "deliveries", label: "Deliveries" },
  { id: "documents", label: "Documents" },
  { id: "notes", label: "Notes" },
];

/**
 * The four sections a customer opens between visits to the site.
 *
 * Not the first four tabs — "Overview" is where they already are, and
 * "Notes" is not something anyone opens on the way to a delivery.
 */
const JUMPS: { id: SectionId; label: string; Icon: typeof Package }[] = [
  { id: "materials", label: "Materials", Icon: Layers },
  { id: "budget", label: "Budget", Icon: Rupee },
  { id: "tasks", label: "Tasks", Icon: CheckCircle },
  { id: "deliveries", label: "Deliveries", Icon: Truck },
];

const MATERIAL_TONE: Record<MaterialStatus, "neutral" | "accent" | "success"> = {
  planned: "neutral",
  ordered: "accent",
  delivered: "success",
};

export function ProjectDashboard({ id }: { id: string }) {
  const { get, ready, error, refresh, setTaskStatus, update, remove } = useProjects();
  const [section, setSection] = useState<SectionId>("overview");
  const [taskError, setTaskError] = useState<string | null>(null);

  /* Notes are lifted here rather than kept in a subcomponent scoped to the
     "notes" tab, because that subcomponent would unmount every time the
     customer switches tabs — cancelling a debounce mid-flight would either
     lose the keystrokes since the last save or need a stale-closure-prone
     flush-on-unmount. State that never unmounts needs neither. */
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [notesStatus, setNotesStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notesError, setNotesError] = useState<string | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!ready) {
    return (
      <div className="space-y-6">
        <StatRowSkeleton count={3} />
        <ListSkeleton rows={3} />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="This project could not be loaded" description={error} retry={refresh} />;
  }

  const project = get(id);
  /* A project id that is not on this account. `notFound` rather than an
     error: from the customer's point of view the URL is simply wrong,
     which is exactly what a 404 means. */
  if (!project) notFound();

  const summary = summarise(project);

  async function handleToggleTask(taskId: string, status: TaskStatus) {
    setTaskError(null);
    try {
      await setTaskStatus(project!.id, taskId, status);
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  function handleNotesChange(next: string) {
    setNotesDraft(next);
    setNotesStatus("idle");
    if (notesTimer.current) clearTimeout(notesTimer.current);
    /* Debounced rather than sent per keystroke — a request per character
       would race itself and hammer the API for no benefit a person could
       notice, unlike the old `localStorage` write it replaces. */
    notesTimer.current = setTimeout(() => void saveNotes(next), 800);
  }

  async function saveNotes(next: string) {
    setNotesStatus("saving");
    setNotesError(null);
    try {
      await update(project!.id, { notes: next });
      setNotesStatus("saved");
    } catch (err) {
      setNotesStatus("error");
      setNotesError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <Header project={project} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Progress"
          value={summary.progressPct != null ? `${summary.progressPct}%` : "—"}
          hint={`${summary.tasksDone} of ${summary.tasksTotal} tasks`}
          icon={<Layers className="size-4" />}
          tone="accent"
        />
        <Stat
          label="Committed"
          value={formatPrice(summary.spentPaise)}
          hint={
            summary.plannedPaise > 0
              ? `+ ${formatPrice(summary.plannedPaise)} planned`
              : "Nothing ordered yet"
          }
          icon={<Rupee className="size-4" />}
        />
        <Stat
          label={summary.overBudget ? "Over budget" : "Remaining"}
          value={formatPrice(Math.abs(summary.remainingPaise))}
          hint={`of ${formatPrice(summary.budgetPaise)}`}
          icon={<Rupee className="size-4" />}
          tone={summary.overBudget ? undefined : "success"}
        />
      </div>

      {/* Phone-only shortcuts into the four sections people actually open,
          plus whatever is next. The tab strip below still holds all eight,
          but on a 390px screen it scrolls, and the two sections a customer
          checks daily should not be a swipe away. */}
      <div className="grid grid-cols-4 gap-2 lg:hidden">
        {JUMPS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            aria-pressed={section === id}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-card border p-2 text-center transition-colors active:scale-[0.98]",
              section === id
                ? "border-accent bg-accent-wash text-accent"
                : "border-line-soft bg-surface text-muted",
            )}
          >
            <Icon className="size-5" />
            <span className="text-micro font-medium">{label}</span>
          </button>
        ))}
      </div>

      {summary.upcoming.length > 0 && (
        <Card padding="md" className="lg:hidden">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted">
            Upcoming
          </p>
          <ul className="mt-2 space-y-2">
            {summary.upcoming.slice(0, 2).map((material) => (
              <li key={material.id} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
                  <Truck className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {material.title}
                  </span>
                  <span className="nums block text-micro text-muted">
                    Expected {material.expectedOn}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Tabs
        items={SECTIONS}
        value={section}
        onChange={setSection}
        label="Project sections"
      />

      {taskError && <InlineError>{taskError}</InlineError>}

      <div key={section} className="anim-fade">
        {section === "overview" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card padding="lg">
              <BudgetBar summary={summary} />
            </Card>

            <Card padding="lg">
              <h2 className="text-title-sm font-semibold text-ink">Next up</h2>
              {project.tasks.filter((t) => t.status !== "done").length === 0 ? (
                <p className="mt-3 text-body-sm text-muted">
                  Everything on the board is done.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {project.tasks
                    .filter((t) => t.status !== "done")
                    .slice(0, 4)
                    .map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center gap-2.5 text-body-sm text-ink"
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                        {task.phase && (
                          <span className="shrink-0 text-micro text-faint">
                            {task.phase}
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            <Card padding="lg" className="lg:col-span-2">
              <h2 className="mb-4 text-title-sm font-semibold text-ink">Timeline</h2>
              <Timeline tasks={project.tasks} onToggle={handleToggleTask} />
            </Card>
          </div>
        )}

        {section === "materials" && (
          <MaterialsSection project={project} />
        )}

        {section === "budget" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card padding="lg">
              <BudgetBar summary={summary} />
              <p className="mt-4 text-caption leading-relaxed text-muted">
                Committed counts material lines you have ordered or received.
                Planned counts lines that are priced but not yet ordered — they
                are not spend until they are.
              </p>
            </Card>
            <Card padding="lg">
              <h2 className="text-title-sm font-semibold text-ink">
                Where it is going
              </h2>
              {project.materials.length === 0 ? (
                <p className="mt-3 text-body-sm text-muted">
                  Nothing priced against this project yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {project.materials.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-baseline justify-between gap-3 text-body-sm"
                    >
                      <span className="min-w-0 truncate text-ink">{m.title}</span>
                      <span className="nums shrink-0 font-medium text-ink">
                        {formatPrice(m.unitPricePaise * m.qty)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {section === "tasks" && (
          <Card padding="lg">
            <Timeline tasks={project.tasks} onToggle={handleToggleTask} />
          </Card>
        )}

        {section === "services" && (
          <EmptyState
            icon={<Briefcase className="size-6" />}
            title="No professionals booked"
            action={{ href: "/services", label: "Find a professional" }}
            secondaryAction={{ href: "/consult", label: "Talk to an expert" }}
          >
            Architects, contractors and fitters booked through Quoin will
            appear here against this project, with their visit dates.
          </EmptyState>
        )}

        {section === "deliveries" && (
          <DeliveriesSection project={project} />
        )}

        {section === "documents" && (
          <EmptyState
            icon={<Document className="size-6" />}
            title="No documents yet"
            action={{ href: "/upload", label: "Upload a parcha" }}
          >
            Drawings, invoices, parchas and specifications for this site will
            collect here so they are not spread across a phone gallery.
          </EmptyState>
        )}

        {section === "notes" && (
          <Card padding="lg">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="project-notes"
                className="text-title-sm font-semibold text-ink"
              >
                Notes
              </label>
              <span className="text-micro text-muted" aria-live="polite">
                {notesStatus === "saving" && "Saving…"}
                {notesStatus === "saved" && "Saved"}
              </span>
            </div>
            <p className="mb-3 mt-1 text-caption text-muted">
              Measurements, decisions, what the contractor said. Saved a
              moment after you stop typing.
            </p>
            <Textarea
              id="project-notes"
              value={notesDraft ?? project.notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={10}
              placeholder="Bathroom: 6ft × 8ft. Tiles arriving Tuesday. Electrician wants the layout by Friday."
            />
            {notesStatus === "error" && notesError && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <InlineError>{notesError}</InlineError>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveNotes(notesDraft ?? project.notes)}
                >
                  Try again
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

      <DangerZone project={project} onDelete={() => remove(project.id)} />
    </div>
  );
}

/* -------------------------------------------------------------- sections */

function Header({ project }: { project: Project }) {
  const summary = summarise(project);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-headline font-semibold text-ink">{project.name}</h1>
            {project.isSample && <Badge tone="info">Sample</Badge>}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
            <span>{PROJECT_KIND_LABEL[project.kind]}</span>
            {project.location && (
              <span className="flex items-center gap-1">
                <Pin className="size-3" />
                {project.location}
              </span>
            )}
            {project.sizeSqft > 0 && (
              <span className="nums">
                {project.sizeSqft.toLocaleString("en-IN")} sq.ft.
              </span>
            )}
            {project.targetDate && (
              <span className="nums">Target {project.targetDate}</span>
            )}
          </p>
        </div>

        <Button href="/products" variant="outline" size="sm" className="shrink-0">
          <Plus className="size-4" />
          Add materials
        </Button>
      </div>

      {summary.progressPct != null && (
        <div className="mt-4">
          <Progress
            value={summary.progressPct}
            label={`${project.name} progress`}
          />
        </div>
      )}
    </div>
  );
}

function MaterialsSection({ project }: { project: Project }) {
  if (project.materials.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="size-6" />}
        title="No materials on this list yet"
        action={{ href: "/upload", label: "Price a parcha" }}
        secondaryAction={{ href: "/products", label: "Browse the catalogue" }}
      >
        Everything you specify or order against this site collects here, with
        what it cost and where it has got to.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-line-hair overflow-hidden rounded-card border border-line-soft bg-surface">
      {project.materials.map((material) => (
        <li key={material.id} className="flex items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            {material.productSlug ? (
              <Link
                href={`/p/${material.productSlug}`}
                className="line-clamp-1 text-body-sm text-ink hover:text-accent"
              >
                {material.title}
              </Link>
            ) : (
              <span className="line-clamp-1 text-body-sm text-ink">
                {material.title}
              </span>
            )}
            <span className="nums mt-0.5 block text-micro text-faint">
              {material.qty} {material.unit} ·{" "}
              {formatPrice(material.unitPricePaise)} each
            </span>
          </span>

          <Badge tone={MATERIAL_TONE[material.status]} size="sm">
            {material.status}
          </Badge>

          <span className="nums w-24 shrink-0 text-right text-body-sm font-semibold text-ink">
            {formatPrice(material.unitPricePaise * material.qty)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DeliveriesSection({ project }: { project: Project }) {
  const summary = summarise(project);

  if (summary.upcoming.length === 0) {
    return (
      <EmptyState
        icon={<Truck className="size-6" />}
        title="Nothing on the way"
        action={{ href: "/products", label: "Order materials" }}
      >
        Deliveries against this project appear here with the date each one
        actually has — instant, scheduled and made-to-order all keep their own.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {summary.upcoming.map((material) => (
        <li
          key={material.id}
          className="flex items-center gap-3 rounded-card border border-line-soft bg-surface p-4"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
            <Package className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-sm font-medium text-ink">
              {material.title}
            </span>
            <span className="nums mt-0.5 block text-micro text-muted">
              {material.qty} {material.unit} · expected {material.expectedOn}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-faint" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Deleting a project.
 *
 * Two presses, not one, and the second says what will be lost. This is the
 * only destructive control in the storefront, and deletion is now a real
 * request rather than a local array filter — `onDelete` is only reflected
 * in the dashboard once the server has actually confirmed it, so a failed
 * request leaves the project exactly as it was rather than showing one
 * that has already vanished from every other screen.
 */
function DangerZone({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: () => Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      toast.toast("Project deleted");
      router.push("/projects");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="border-t border-line-hair pt-6">
      {confirming ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-caption text-muted">
              Delete <span className="text-ink">{project.name}</span> and its{" "}
              <span className="nums">{project.materials.length}</span> material
              lines and <span className="nums">{project.tasks.length}</span> tasks?
              This cannot be undone.
            </p>
            <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
              Delete it
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              Keep it
            </Button>
          </div>
          {deleteError && <InlineError>{deleteError}</InlineError>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={cn(
            "flex items-center gap-1.5 text-caption text-muted transition-colors hover:text-danger",
          )}
        >
          <Trash className="size-3.5" />
          Delete this project
        </button>
      )}
    </div>
  );
}
