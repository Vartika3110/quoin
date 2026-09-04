import Link from "next/link";
import type { ReactNode } from "react";
import { Chevron } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * A section heading, and the gutter rule that goes with it.
 *
 * Every page in the storefront is built from these, which is what keeps
 * the vertical rhythm the same on the home page and the account
 * dashboard. The `px-5 lg:px-0` is not incidental: content is inset from
 * the phone's edge and flush with the desktop column, and repeating that
 * pair by hand on every heading is how the two drift apart.
 */
export function SectionHead({
  title,
  subtitle,
  href,
  linkLabel = "See all",
  action,
  level = 2,
  size = "md",
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Renders the trailing "See all" link. */
  href?: string;
  linkLabel?: string;
  /** Anything else on the right — a sort control, a filter button. */
  action?: ReactNode;
  level?: 1 | 2 | 3;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  /* Heading level is a prop because the visual size of a heading and its
     place in the document outline are different questions — a page title
     that must be h1 is often not the largest thing on the screen. */
  const Tag = level === 1 ? "h1" : level === 3 ? "h3" : "h2";

  return (
    <div
      className={cn(
        "mb-3 flex items-end justify-between gap-4 px-5 lg:px-0",
        subtitle && "mb-4",
        className,
      )}
    >
      <div className="min-w-0">
        <Tag
          className={cn(
            "font-semibold text-ink",
            size === "lg"
              ? "text-headline"
              : size === "sm"
                ? "text-title-sm"
                : "text-title",
          )}
        >
          {title}
        </Tag>
        {subtitle && (
          <p className="mt-1 max-w-prose text-body-sm text-muted">{subtitle}</p>
        )}
      </div>

      {action ??
        (href && (
          <Link
            href={href}
            className="tap-target relative flex shrink-0 items-center gap-0.5 text-caption font-medium text-accent transition-colors hover:text-accent-bright"
          >
            {linkLabel}
            <Chevron className="size-3.5" />
          </Link>
        ))}
    </div>
  );
}

/**
 * The standard page gutter as a component, for the blocks that are not
 * headings. Content that must bleed to the edge — rails, full-width
 * photography — simply does not use it.
 */
export function Gutter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-5 lg:px-0", className)}>{children}</div>;
}

/** Vertical rhythm between top-level page sections. One value, one place. */
export function PageSections({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-10 pt-4 lg:space-y-14 lg:pt-0", className)}>
      {children}
    </div>
  );
}
