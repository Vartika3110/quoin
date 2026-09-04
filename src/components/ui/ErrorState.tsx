"use client";

import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * Something failed.
 *
 * A customer is never shown a stack trace, a Prisma message or an HTTP
 * status. Those tell them nothing they can act on and tell an attacker
 * something about the schema. What they get is what went wrong in one
 * sentence and the control that retries it.
 *
 * `digest` is the exception: Next.js puts a hash on server errors and the
 * same hash appears in the server log, so showing it is the difference
 * between a support conversation that can find the error and one that
 * cannot. It is rendered small, as a reference, and never as prose.
 */
export function ErrorState({
  title = "Something went wrong.",
  description = "The page could not be loaded. This is usually temporary.",
  retry,
  digest,
  className,
  compact = false,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
  digest?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-card border border-line-soft bg-surface text-center",
        compact ? "px-5 py-8" : "px-6 py-14",
        className,
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-danger-wash text-danger">
        <Alert className="size-6" />
      </span>
      <p className="text-title-sm font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-body-sm leading-relaxed text-muted">
        {description}
      </p>
      {retry && (
        <Button className="mt-6" onClick={retry}>
          Try again
        </Button>
      )}
      {digest && (
        <p className="mt-4 text-micro text-faint">
          Reference <span className="nums">{digest}</span>
        </p>
      )}
    </div>
  );
}

/** An error inside a form or a card, where a full state would be too much. */
export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-wash px-3 py-2 text-caption text-danger"
    >
      <Alert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
