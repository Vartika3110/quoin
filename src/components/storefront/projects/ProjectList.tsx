"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Progress } from "@/components/ui/Progress";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { ArrowRight, Chevron, Layers, Pin, Rupee, Upload } from "@/components/icons";
import {
  PROJECT_KIND_LABEL,
  summarise,
  useProjects,
  type LocalImport,
  type Project,
} from "@/lib/store/projects";
import { formatPrice } from "@/lib/types/catalog";

/**
 * Every project on this account.
 *
 * `ready` now means "the request settled", not "hydration finished" — a
 * real network round trip sits behind it, so the skeleton is covering
 * actual latency rather than one frame of uncertainty. `error` is kept
 * distinct from an empty list: zero projects is a normal account, a
 * failed fetch is not, and only one of those should offer a retry.
 */
export function ProjectList() {
  const { projects, ready, error, refresh, localImport } = useProjects();

  if (!ready) return <ListSkeleton rows={2} />;

  if (error) {
    return (
      <ErrorState
        compact
        title="Your projects could not be loaded"
        description={error}
        retry={refresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      {localImport.pending != null && <LocalImportBanner localImport={localImport} />}

      {projects.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-6" />}
          title="Your next project starts here"
          action={{ href: "/projects/new", label: "Create a project" }}
          secondaryAction={{ href: "/upload", label: "Upload a parcha" }}
        >
          A project holds the budget, the material list, the tasks and every
          delivery for one site — so a renovation running over months reads as
          one thing rather than forty unrelated purchases.
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>

          <Button href="/projects/new" variant="outline" block>
            Start another project
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * The one-time offer to bring pre-account projects across.
 *
 * One prompt, one outcome: accepting or declining both record a decision
 * (see `shouldOfferLocalImport` in the store) so this does not resurface
 * on every visit the way an un-dismissable banner would.
 */
function LocalImportBanner({ localImport }: { localImport: LocalImport }) {
  const { pending, busy, error, accept, decline } = localImport;

  return (
    <Card tone="accent" padding="lg">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
          <Upload className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">
            Bring {pending} {pending === 1 ? "project" : "projects"} from this browser?
          </p>
          <p className="mt-1 text-caption text-muted">
            {pending === 1 ? "It was" : "They were"} saved here before projects
            moved to your account. Importing keeps everything — budget,
            materials, tasks — and only clears the local copy once the
            account has it.
          </p>
          {error && (
            <p className="mt-2 text-caption text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={decline} disabled={busy}>
            Not now
          </Button>
          <Button size="sm" onClick={accept} loading={busy}>
            Import
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const summary = summarise(project);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-card border border-line-soft bg-surface p-5 transition-[transform,box-shadow,border-color] duration-200 ease-out-quart hover:-translate-y-0.5 hover:border-line hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-title-sm font-semibold text-ink">{project.name}</h3>
            {project.isSample && <Badge tone="info">Sample</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
            <span>{PROJECT_KIND_LABEL[project.kind]}</span>
            {project.location && (
              <span className="flex items-center gap-1">
                <Pin className="size-3" />
                {project.location}
              </span>
            )}
            {project.sizeSqft > 0 && (
              <span className="nums">{project.sizeSqft.toLocaleString("en-IN")} sq.ft.</span>
            )}
          </p>
        </div>
        <Chevron className="mt-1 size-4 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>

      {summary.progressPct != null && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-micro text-muted">
              {summary.tasksDone} of {summary.tasksTotal} tasks done
            </span>
            <span className="nums text-micro font-semibold text-ink">
              {summary.progressPct}%
            </span>
          </div>
          <Progress
            value={summary.progressPct}
            label={`${project.name} progress`}
            size="sm"
          />
        </div>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line-hair pt-4">
        <Figure label="Budget" value={formatPrice(summary.budgetPaise)} />
        <Figure label="Spent" value={formatPrice(summary.spentPaise)} />
        <Figure
          label="Remaining"
          value={formatPrice(summary.remainingPaise)}
          tone={summary.overBudget ? "danger" : "success"}
        />
      </dl>
    </Link>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-micro text-muted">
        {label === "Budget" && <Rupee className="size-3" />}
        {label}
      </dt>
      <dd
        className={
          "nums mt-0.5 text-body-sm font-semibold " +
          (tone === "danger"
            ? "text-danger"
            : tone === "success"
              ? "text-success"
              : "text-ink")
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** The "start one" prompt, for pages that are not the projects list. */
export function ProjectPrompt() {
  return (
    <Card tone="accent" padding="lg" className="flex flex-wrap items-center gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
        <Layers className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">Working on a site?</p>
        <p className="mt-0.5 text-caption text-muted">
          Keep the budget, the list and every delivery in one place.
        </p>
      </div>
      <Button href="/projects/new" className="shrink-0">
        Start a project
        <ArrowRight className="size-4" />
      </Button>
    </Card>
  );
}
