import { cn } from "@/components/ui/cn";
import { Check } from "@/components/icons";
import { projectJourney } from "@/lib/projects/journey";
import type { Project } from "@/lib/store/projects";

/**
 * The project's own timeline — `projectJourney`, drawn.
 *
 * A flat checklist rather than a rail like `Timeline` (tasks, which has
 * real phases and an order a customer chose): this ladder is fixed and
 * whole-project, seven steps every build passes through in the same
 * sequence, so there is nothing to group.
 */
export function JourneyCard({ project }: { project: Project }) {
  const steps = projectJourney({
    createdAt: new Date(project.createdAt).toISOString(),
    materials: project.materials,
    orders: project.orders,
    services: project.services,
  });

  return (
    <div>
      <h2 className="font-display text-title-sm font-semibold text-ink">Project timeline</h2>
      <ol className="mt-3 space-y-3">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3">
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-200 ease-out-quart",
                step.done
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line-soft bg-surface text-faint",
              )}
            >
              {step.done ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 text-body-sm transition-colors duration-200",
                step.done ? "text-ink" : "text-muted",
              )}
            >
              {step.label}
            </span>
            {step.at && (
              <span className="nums shrink-0 text-micro text-faint">{formatStepDate(step.at)}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
});

/** `at` is either a calendar day (`YYYY-MM-DD`, from `expectedDeliveryOn`)
    or an ISO instant — `projectJourney` never says which, so a 10-character
    string is read as midnight UTC on that day and anything else as the
    instant it already is. */
function formatStepDate(at: string): string {
  const date = at.length === 10 ? new Date(`${at}T00:00:00Z`) : new Date(at);
  return Number.isNaN(date.getTime()) ? "" : DAY_FORMAT.format(date);
}
