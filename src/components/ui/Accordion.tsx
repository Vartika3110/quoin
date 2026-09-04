import { ChevronDown } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * A disclosure.
 *
 * Built on `<details>`/`<summary>` rather than state and a div. That gets
 * the correct semantics, keyboard behaviour and in-page find for free —
 * browsers now expand a closed `<details>` when its content matches a
 * Ctrl-F search, which a hand-rolled accordion silently breaks — and it
 * works with JavaScript off.
 *
 * `open` here is the *initial* state only; the browser owns it afterwards.
 * That is deliberate: nothing else on the page needs to know whether a
 * specification table is expanded, and lifting it into React would make
 * every toggle a re-render of the page.
 */
export function Accordion({
  title,
  subtitle,
  children,
  defaultOpen = false,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group overflow-hidden rounded-card border border-line-soft bg-surface",
        className,
      )}
    >
      <summary
        /* `list-none` plus the WebKit pseudo-element: Safari draws its own
           triangle and ignores `list-style`, so both are needed to replace
           the marker with the chevron below. */
        className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 transition-colors hover:bg-hover [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-ink">{title}</span>
          {subtitle && (
            <span className="mt-0.5 block text-caption text-muted">{subtitle}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-line-hair px-4 py-4">{children}</div>
    </details>
  );
}
