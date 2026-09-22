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
            /* The display face on every section heading in the app. It is
               the single assignment that does most of the work of making
               the storefront look like one designed thing: the headings
               are the only type a reader scans rather than reads, which
               is exactly what a display face is for. The subtitle below
               stays sans, because that one is read. */
            "font-display font-semibold text-ink",
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

/**
 * The smallest number of things a section may show.
 *
 * Four, because that is one full row at every width the storefront lays
 * out — four across on a desktop grid, two by two on a phone. A rail of
 * one product under a heading that says "Project Essentials" does not
 * read as a small selection; it reads as a query that failed, and it
 * makes the rest of the page's numbers look unreliable too. Below four,
 * the section is not a thin version of itself — it is nothing, and
 * nothing is what it should render.
 */
export const MIN_SECTION_ITEMS = 4;

/**
 * Whether a section has enough to be worth drawing.
 *
 * A type guard as well as a test, so `hasEnough(deals) && <Rail …/>`
 * narrows away the null and the caller does not need a second check.
 * Sections that are genuinely one thing — a hero, a promo, a single
 * summary card — are not collections and do not come through here.
 */
export function hasEnough<T>(
  items: readonly T[] | null | undefined,
  min: number = MIN_SECTION_ITEMS,
): items is readonly T[] {
  return Array.isArray(items) && items.length >= min;
}
