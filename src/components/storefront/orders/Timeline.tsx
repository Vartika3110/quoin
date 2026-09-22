import { Badge } from "@/components/ui/Badge";
import { Check } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import type { OrderTimelineResult } from "@/lib/orders/timeline";

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The vertical stepper on the order detail page — a plain render of
 * `orderTimeline()` (`src/lib/orders/timeline.ts`), which is where every
 * actual decision about which step is done, current or upcoming lives.
 * No state and no interactivity here, so this stays a server component;
 * the only motion is `anim-pop` on the step actually in progress, a CSS
 * transition rather than anything JavaScript drives.
 */
export function Timeline({ timeline }: { timeline: OrderTimelineResult }) {
  return (
    <div>
      <ol>
        {timeline.steps.map((step, i) => {
          const last = i === timeline.steps.length - 1;
          return (
            <li key={step.key} className="relative flex gap-3">
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[11px] top-6 h-[calc(100%_-_8px)] w-px",
                    step.state === "done" ? "bg-accent" : "bg-line-soft",
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-200",
                  step.state === "done" && "border-accent bg-accent text-on-accent",
                  step.state === "current" && "anim-pop border-accent bg-surface text-accent",
                  step.state === "upcoming" && "border-line-soft bg-surface text-faint",
                )}
              >
                {step.state === "done" ? (
                  <Check className="size-3.5" />
                ) : (
                  <span className="block size-1.5 rounded-full bg-current" />
                )}
              </span>
              <div className={cn("min-w-0 flex-1 pb-6", last && "pb-0")}>
                <p
                  className={cn(
                    "text-body-sm font-medium",
                    step.state === "upcoming" ? "text-faint" : "text-ink",
                  )}
                >
                  {step.label}
                  {step.state === "current" && (
                    <span className="ml-2 text-micro font-normal text-accent">In progress</span>
                  )}
                </p>
                {step.at && (
                  <p className="nums mt-0.5 text-caption text-muted">
                    {DATE_TIME_FORMAT.format(new Date(step.at))}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {timeline.outcome && (
        <Badge tone={timeline.outcome.tone} className="mt-1">
          {timeline.outcome.label}
        </Badge>
      )}
    </div>
  );
}
