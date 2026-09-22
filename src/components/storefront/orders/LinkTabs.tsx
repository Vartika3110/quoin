import Link from "next/link";
import { cn } from "@/components/ui/cn";

/**
 * A tab strip whose selection lives in the URL, not component state.
 *
 * `Tabs` (`src/components/ui/Tabs.tsx`) implements the ARIA tabs pattern
 * for a strip that swaps an in-page panel in place — arrow keys move
 * between tabs, and only the active one takes a tab stop. Every item
 * here is instead a real navigation to a different `?tab=` link (so a
 * filtered link is one a customer can bookmark or a colleague can be
 * sent), and giving it `role="tablist"`/`role="tab"` would tell a screen
 * reader that arrow keys switch a panel with nothing on the page
 * actually doing that. `aria-current="page"` on the active link is what
 * `AccountShell`'s own section rail already uses for the same shape of
 * control; this repeats it rather than `Tabs`' ARIA pattern, and matches
 * `Tabs`' underline variant visually so the two read as the same kind of
 * control.
 */
export function LinkTabs<T extends string>({
  items,
  value,
  hrefFor,
  label,
  className,
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  hrefFor: (id: T) => string;
  /** Names the strip for assistive technology. */
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("no-scrollbar flex gap-1 overflow-x-auto border-b border-line-soft", className)}
    >
      {items.map((item) => {
        const on = item.id === value;
        return (
          <Link
            key={item.id}
            href={hrefFor(item.id)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-body font-medium transition-colors",
              on ? "text-accent" : "text-muted hover:text-ink",
            )}
          >
            {item.label}
            {item.count != null && <span className="nums text-micro text-faint">{item.count}</span>}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors",
                on ? "bg-accent" : "bg-transparent",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
