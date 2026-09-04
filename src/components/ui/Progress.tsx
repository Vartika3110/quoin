import { cn } from "@/components/ui/cn";

/**
 * A determinate progress bar.
 *
 * `<progress>` is not used because it cannot be styled consistently
 * across browsers without resetting three vendor pseudo-elements, and the
 * ARIA progressbar role carries the same semantics with none of that.
 */
export function Progress({
  value,
  max = 100,
  label,
  tone = "accent",
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  /** Announced with the value. Required for anything a customer reads. */
  label: string;
  tone?: "accent" | "success" | "deep" | "pro";
  size?: "sm" | "md";
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "w-full overflow-hidden rounded-full bg-sunk",
        size === "sm" ? "h-1" : "h-2",
        className,
      )}
    >
      <div
        /* Width rather than a transform: the bar is a fixed track and the
           fill has to clip to the rounded end, which a scaled child does
           not do without distorting its own corner radius. */
        style={{ width: `${pct}%` }}
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out-quart",
          tone === "accent" && "bg-accent",
          tone === "success" && "bg-success",
          tone === "deep" && "bg-deep",
          tone === "pro" && "bg-pro",
        )}
      />
    </div>
  );
}

/**
 * A step indicator for a multi-step flow.
 *
 * Shows position, not just proportion: "3 of 6" with the completed steps
 * marked is the difference between a checkout that feels bounded and one
 * that feels open-ended.
 */
export function Steps({
  steps,
  current,
  className,
}: {
  steps: string[];
  /** Zero-based index of the step being shown. */
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center gap-2", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "h-1 rounded-full transition-colors duration-300",
                  done || active ? "bg-accent" : "bg-sunk",
                )}
              />
              <span
                className={cn(
                  "truncate text-micro font-medium transition-colors",
                  active ? "text-accent" : done ? "text-muted" : "text-faint",
                )}
              >
                {step}
              </span>
            </span>
            {/* The accessible version of the same information. The bars
                above are decorative; this is what is announced. */}
            {active && (
              <span className="sr-only">
                Step {i + 1} of {steps.length}: {step}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
