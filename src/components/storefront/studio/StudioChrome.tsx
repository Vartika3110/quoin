"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Plus } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * Studio's masthead: what this is on the left, where you can go on the
 * right.
 *
 * This replaces a 208px sticky rail. The rail was defensible when Studio
 * was four destinations and a filter panel, and it stopped being so when
 * the grid became the point: a wall of rooms wants the whole container
 * width, and a column of four links is not worth a seventh of a 1440px
 * page to draw permanently. Four pills on the same line as the title cost
 * nothing and say the same thing.
 *
 * **"Boards", not "Spaces".** The routes are still `/studio/spaces` —
 * renaming a URL that people have saved and shared buys nothing and
 * breaks links — and `/studio/boards` redirects there so the word in the
 * UI is also a URL that works. The word changed because "space" was
 * already doing two jobs in this product: a room someone is working on,
 * and a room in a photograph. One of them had to give the name up.
 */
const TABS = [
  { href: "/studio", label: "Discover", exact: true },
  { href: "/studio/saved", label: "Saved" },
  { href: "/studio/spaces", label: "Boards" },
  { href: "/studio/designers", label: "Designers" },
];

function isCurrent(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioChrome({
  title = "Studio",
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const pathname = usePathname();

  return (
    <header className="mb-5 flex flex-col gap-4 px-5 lg:mb-7 lg:flex-row lg:items-end lg:justify-between lg:px-0">
      <div className="min-w-0">
        <h1 className="font-display text-headline font-light tracking-tight text-ink lg:text-headline-lg">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-xl text-body-sm text-muted">{subtitle}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* A scrolling row below `lg`, because four pills and a button do
            not fit on a 390px line and a wrapped pill bar reads as two
            navigations. `no-scrollbar` and no negative margin — the
            parent's gutter is the one the first pill should start on. */}
        <nav
          aria-label="Studio"
          className="no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 lg:flex-none"
        >
          {TABS.map(({ href, label, exact }) => {
            const on = isCurrent(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "tap-target flex min-h-10 shrink-0 items-center rounded-full border px-4 text-body-sm font-medium transition-colors",
                  on
                    ? "border-accent-edge bg-accent-wash text-accent"
                    : "border-line-soft bg-surface text-muted hover:bg-hover hover:text-ink",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <Button href="/studio/spaces?new=1" size="sm" className="shrink-0">
          <Plus className="size-4" />
          {/* The word is the whole button on a phone, where "New board"
              beside four pills is the thing that pushes the row off the
              screen. */}
          <span className="hidden sm:inline">New board</span>
          <span className="sr-only sm:hidden">New board</span>
        </Button>
      </div>
    </header>
  );
}
