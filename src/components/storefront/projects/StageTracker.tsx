import { Check } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { PROJECT_STAGES } from "@/lib/store/projects";

/**
 * The five-step build ladder, as a horizontal stepper.
 *
 * `stage` is an index into `PROJECT_STAGES` computed by `deriveStage` —
 * see that function's comment for why it is never a stored field. This
 * component only draws whatever index it is handed: a step is done when
 * it is behind the current one, current when it matches, and upcoming
 * otherwise.
 */
export function StageTracker({ stage }: { stage: number }) {
  return (
    <div>
      <p className="text-caption text-muted">
        Currently in <span className="font-medium text-ink">{PROJECT_STAGES[stage]}</span>
      </p>
      <ol className="mt-3 flex items-start">
        {PROJECT_STAGES.map((label, i) => {
          const done = i < stage;
          const current = i === stage;
          return (
            <li key={label} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border text-micro font-semibold",
                    done && "border-accent bg-accent text-on-accent",
                    current && "border-accent bg-accent-wash text-accent",
                    !done && !current && "border-line-soft bg-surface text-faint",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "max-w-14 text-center text-micro font-medium leading-tight",
                    done || current ? "text-accent" : "text-faint",
                  )}
                >
                  {label}
                </span>
              </div>
              {i < PROJECT_STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "mt-3.5 h-0.5 flex-1",
                    i < stage ? "bg-accent" : "bg-line-soft",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
