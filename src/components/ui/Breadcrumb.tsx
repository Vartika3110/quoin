import Link from "next/link";
import { Chevron } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * Where you are in the catalogue.
 *
 * Marked up as a nav around an ordered list, which is what lets a screen
 * reader announce "breadcrumb, list of 3" and skip it. The last crumb is
 * the current page and is not a link — a link to where you already are is
 * a dead control that still takes a tab stop.
 *
 * On a phone the trail scrolls rather than wrapping: two wrapped lines of
 * breadcrumb above a product title costs more than the trail is worth.
 */
export function Breadcrumb({
  items,
  className,
}: {
  items: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto whitespace-nowrap text-caption">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <Chevron className="size-3 shrink-0 text-faint" aria-hidden />
              )}
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined} className="text-muted">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-muted transition-colors hover:text-accent"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
