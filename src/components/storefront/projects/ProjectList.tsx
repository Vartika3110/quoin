"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/Progress";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { ArrowRight, Chevron, Layers, Pin, Rupee } from "@/components/icons";
import {
  PROJECT_KIND_LABEL,
  summarise,
  useProjects,
  type Project,
} from "@/lib/store/projects";
import { formatPrice } from "@/lib/types/catalog";

/**
 * Every project this browser knows about.
 *
 * Client-rendered because that is where projects currently live. The
 * skeleton is doing real work here rather than decoration: the store reads
 * `localStorage` in an effect, so there is genuinely one frame where the
 * answer is unknown, and rendering the empty state during it would tell a
 * returning customer their project was gone.
 */
export function ProjectList() {
  const { projects, ready } = useProjects();

  if (!ready) return <ListSkeleton rows={2} />;

  if (projects.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-4">
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
    </div>
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
