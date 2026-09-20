"use client";

import type { ReactNode } from "react";
import { StickyBar } from "@/components/storefront/StickyBar";
import { FilterDrawer } from "@/components/storefront/browse/FilterDrawer";
import { SortSheet } from "@/components/storefront/browse/SortSheet";
import { Sliders, Sort } from "@/components/icons";
import { Counter } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import type { BrowseParams } from "@/lib/browse-params";
import type { ProductSort } from "@/lib/data/catalog";

/**
 * Sort and Filter, pinned under the thumb.
 *
 * The two controls used to sit in the toolbar above the grid, which is
 * where they are on a desktop and exactly the wrong place on a phone: by
 * the third row of tiles they have scrolled away, and deciding to narrow
 * a list is a thing you decide *after* looking at it, not before. Every
 * catalogue app on a phone has settled on the same answer — a fixed strip
 * at the bottom holding nothing but these two — and it is settled because
 * the alternative makes people scroll to the top to filter and then lose
 * their place.
 *
 * Built on `StickyBar`, so it stacks above the tab bar with the right
 * safe-area inset and the floating cart bar stands down while it is up,
 * rather than the two occupying the same strip. That is also why this is
 * a component and not three lines in `Browse` — the claim happens on
 * mount, so the bar has to be a mounted thing.
 *
 * `padded={false}` because these are two 52px targets that meet in the
 * middle and run to both edges; a padded bar would draw them as two pills
 * floating in a tray. The divider between them is the only chrome.
 */
export function BrowseActionBar({
  basePath,
  params,
  activeSort,
  activeCount,
  showFilters,
  panel,
}: {
  basePath: string;
  params: BrowseParams;
  activeSort: ProductSort;
  activeCount: number;
  /**
   * `false` on the pages whose whole point is one filter — Deals. Sort
   * still earns its half of the bar there, and takes the whole width:
   * half a bar with dead space beside it reads as a control that failed
   * to load.
   */
  showFilters: boolean;
  /** The same server-rendered `FilterPanel` the desktop sidebar shows. */
  panel: ReactNode;
}) {
  return (
    <StickyBar padded={false}>
      <SortSheet
        basePath={basePath}
        params={params}
        activeSort={activeSort}
        trigger={(open) => (
          <Cell onClick={open}>
            <Sort className="size-4.5" />
            Sort
          </Cell>
        )}
      />

      {showFilters && (
        <>
          <span aria-hidden className="h-6 w-px shrink-0 bg-line-soft" />

          <FilterDrawer
            activeCount={activeCount}
            trigger={(open) => (
              <Cell onClick={open} active={activeCount > 0}>
                <Sliders className="size-4.5" />
                Filters
                {activeCount > 0 && <Counter value={activeCount} />}
              </Cell>
            )}
          >
            {panel}
          </FilterDrawer>
        </>
      )}
    </StickyBar>
  );
}

/**
 * One half of the bar.
 *
 * 52px rather than the 44px minimum: this is the control a thumb reaches
 * for without looking, halfway through a grid, and the extra eight pixels
 * are free — the strip is already that tall once the safe-area inset is
 * in it.
 */
function Cell({
  onClick,
  active = false,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-13 flex-1 items-center justify-center gap-2 text-caption font-medium transition-colors active:bg-hover",
        active ? "text-accent" : "text-ink",
      )}
    >
      {children}
    </button>
  );
}
