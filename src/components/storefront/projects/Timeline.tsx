"use client";

import { cn } from "@/components/ui/cn";
import { Check } from "@/components/icons";
import type { ProjectTask, TaskStatus } from "@/lib/store/projects";

/**
 * The project timeline.
 *
 * A vertical rail with one node per phase, because a build is a sequence
 * and a horizontal Gantt bar on a 390px screen is unreadable. Phases come
 * from the tasks rather than from a fixed list of construction stages —
 * a bathroom refit and a new build do not share a sequence, and a hard-coded
 * "Foundation → Structure → Finishing" would be wrong for most projects on
 * this app.
 *
 * A phase is done when every task in it is done, in progress when any is,
 * and pending otherwise. Derived rather than stored, so ticking the last
 * task in a phase closes the phase without a second thing to remember.
 */
export function Timeline({
  tasks,
  onToggle,
}: {
  tasks: ProjectTask[];
  onToggle?: (taskId: string, status: TaskStatus) => void;
}) {
  const phases = groupByPhase(tasks);

  if (phases.length === 0) {
    return (
      <p className="py-6 text-center text-body-sm text-muted">
        No tasks yet. Add one and it appears on the timeline.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {phases.map((phase, i) => {
        const last = i === phases.length - 1;
        return (
          <li key={phase.name} className="relative flex gap-4 pb-6 last:pb-0">
            {/* The rail. Drawn per row and stopped on the last one, so the
                line never dangles past the final node. */}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[15px] top-8 h-full w-px",
                  phase.state === "done" ? "bg-accent/40" : "bg-line",
                )}
              />
            )}

            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors",
                phase.state === "done"
                  ? "border-accent bg-accent text-on-accent"
                  : phase.state === "doing"
                    ? "border-accent bg-surface text-accent"
                    : "border-line bg-surface text-faint",
              )}
            >
              {phase.state === "done" ? (
                <Check className="size-4" strokeWidth={3} />
              ) : (
                <span className="size-2 rounded-full bg-current" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3
                  className={cn(
                    "text-body font-semibold",
                    phase.state === "pending" ? "text-muted" : "text-ink",
                  )}
                >
                  {phase.name}
                </h3>
                <span className="nums text-micro text-faint">
                  {phase.done} / {phase.tasks.length}
                </span>
              </div>

              <ul className="mt-2 space-y-1">
                {phase.tasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      disabled={!onToggle}
                      onClick={() =>
                        onToggle?.(
                          task.id,
                          task.status === "done" ? "todo" : "done",
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                        onToggle && "hover:bg-hover",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-4.5 shrink-0 place-items-center rounded-xs border transition-colors",
                          task.status === "done"
                            ? "border-accent bg-accent text-on-accent"
                            : "border-line-strong text-transparent",
                        )}
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-body-sm",
                          task.status === "done"
                            ? "text-faint line-through"
                            : "text-ink",
                        )}
                      >
                        {task.title}
                      </span>
                      {task.dueDate && (
                        <span className="nums shrink-0 text-micro text-faint">
                          {task.dueDate}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface Phase {
  name: string;
  tasks: ProjectTask[];
  done: number;
  state: "done" | "doing" | "pending";
}

function groupByPhase(tasks: ProjectTask[]): Phase[] {
  const order: string[] = [];
  const byPhase = new Map<string, ProjectTask[]>();

  for (const task of tasks) {
    /* Tasks with no phase collect under one heading rather than each
       becoming a phase of one — a timeline of nine single-task nodes is
       a list with extra decoration. */
    const name = task.phase ?? "Other";
    if (!byPhase.has(name)) {
      byPhase.set(name, []);
      order.push(name);
    }
    byPhase.get(name)!.push(task);
  }

  return order.map((name) => {
    const inPhase = byPhase.get(name)!;
    const done = inPhase.filter((t) => t.status === "done").length;
    return {
      name,
      tasks: inPhase,
      done,
      state:
        done === inPhase.length
          ? ("done" as const)
          : done > 0 || inPhase.some((t) => t.status === "doing")
            ? ("doing" as const)
            : ("pending" as const),
    };
  });
}
