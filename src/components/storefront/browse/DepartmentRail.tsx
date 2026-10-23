"use client";

import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { useActiveChipIntoView } from "@/components/storefront/browse/useActiveChipIntoView";

/**
 * Switch department without going back to the directory.
 *
 * The single most common move in a catalogue this wide is "not this
 * department, the next one" — and until now that took three taps: back,
 * categories, pick. This is one, and it is a rail of links rather than a
 * control, so every department is a real URL that can be shared, opened
 * in a tab and crawled.
 *
 * Deliberately not a filter. Each chip *navigates* to that department's
 * own page, which is where its facets, its copy and its canonical URL
 * live. A department implemented as `?category=` would have fourteen
 * listings sharing one page's metadata.
 *
 * Any filter already applied is dropped on the way, because a brand or a
 * price ceiling chosen inside Bathware almost never has a counterpart in
 * Cement — carrying it across is how a listing arrives empty for reasons
 * the reader cannot see.
 *
 * A client component for one reason: scrolling the current department
 * into view. Every link here still renders and works server-side with
 * JavaScript off — see `useActiveChipIntoView` for why the row needs it
 * now that it sits on the department pages themselves.
 */
export function DepartmentRail({
  categories,
  activeSlug,
  className,
}: {
  categories: { id: string; slug: string; title: string }[];
  /** Undefined on `/products`, which is what makes "All" the current one. */
  activeSlug?: string;
  className?: string;
}) {
  const activeRef = useActiveChipIntoView<HTMLAnchorElement>(activeSlug);

  return (
    <nav
      aria-label="Departments"
      className={cn("rail gap-2 px-5 scroll-pl-5 lg:hidden", className)}
    >
      <Chip href="/products" label="All" active={activeSlug == null} />
      {categories.map((category) => {
        const active = category.slug === activeSlug;
        return (
          <Chip
            key={category.id}
            ref={active ? activeRef : undefined}
            href={`/c/${category.slug}`}
            label={category.title}
            active={active}
          />
        );
      })}
    </nav>
  );
}

function Chip({
  href,
  label,
  active,
  ref,
}: {
  href: string;
  label: string;
  active: boolean;
  ref?: React.Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-caption font-semibold transition-colors",
        active
          ? "border-transparent bg-accent text-on-accent"
          : "border-line bg-surface text-ink hover:border-line-strong",
      )}
    >
      {label}
    </Link>
  );
}
