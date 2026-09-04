import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

/**
 * Nothing here — said properly.
 *
 * An empty state has one job beyond saying "empty": tell the reader what
 * would put something here, and give them the control that does it. A
 * screen that says "No projects" and stops is a dead end, and a dead end
 * on a first visit is where people decide the product is unfinished.
 *
 * Deliberately not `Placeholder`, which says "we have not built this".
 * These two look similar and mean opposite things, so they stay separate
 * components rather than one with a flag.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  secondaryAction,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: { href?: string; label: string; onClick?: () => void };
  secondaryAction?: { href?: string; label: string };
  className?: string;
  /** Inside a card or a drawer, where the full padding is too much. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-card border border-dashed border-line bg-surface text-center",
        compact ? "px-5 py-8" : "px-6 py-14",
        className,
      )}
    >
      {icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-accent-wash text-accent">
          {icon}
        </span>
      )}
      <p className="text-title-sm font-semibold text-ink">{title}</p>
      {children && (
        <p className="mx-auto mt-2 max-w-sm text-body-sm leading-relaxed text-muted">
          {children}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action &&
            (action.href ? (
              <Button href={action.href}>{action.label}</Button>
            ) : (
              <Button onClick={action.onClick}>{action.label}</Button>
            ))}
          {secondaryAction?.href && (
            <Button href={secondaryAction.href} variant="outline">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
