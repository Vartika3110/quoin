"use client";

import { useState } from "react";
import { TAB_ICONS } from "@/components/icons";
import type { CatalogTab } from "@/lib/types/catalog";

/**
 * Top-level catalogue filter. Client-side today because the fixture data
 * is already loaded; once the catalogue is served this becomes a link
 * list writing `?tab=` so each tab is shareable and crawlable.
 *
 * The row sits on its own card rather than bare on the page ground. Six
 * icons floating between the tiles above and the hero below read as
 * decoration in the gap; on a surface they read as a control, and the
 * card's edge is what says where the control begins and ends.
 */
export function TabRail({ tabs }: { tabs: CatalogTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div className="px-5 lg:px-0">
      {/* The card, not the rail, carries the padding: a scrolling row with
          horizontal padding drops it at the scroll extremes, so the last
          tab ends flush against the edge it was meant to be inset from. */}
      <div className="rounded-card border border-line-soft bg-surface px-3 py-2 lg:px-5">
        <div
          role="tablist"
          aria-label="Product categories"
          /* Spread across the card once there is room for all six, and
             fall back to a scrolling rail when there is not. */
          className="rail gap-5 sm:justify-between sm:gap-2"
        >
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.icon as keyof typeof TAB_ICONS] ?? TAB_ICONS.grid;
            const on = tab.id === active;

            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(tab.id)}
                className="flex w-28 shrink-0 flex-col items-center gap-1"
              >
                <Icon className={`size-14 ${on ? "text-accent" : "text-ink"}`} />
                {/* `whitespace-nowrap`, and the tab widened to fit the
                    longest label on one line. "Premium Products" wrapping
                    to two set the height of the whole row — flex stretches
                    every tab to the tallest — so five single-line tabs each
                    carried a second line of empty space to accommodate the
                    sixth. Wider and shorter is the better trade: the rail
                    scrolls horizontally on a phone anyway. */}
                <span
                  className={`whitespace-nowrap text-center text-[11px] leading-tight ${
                    on ? "text-accent" : "text-muted"
                  }`}
                >
                  {tab.label}
                </span>
                {/* The current-tab underline. `mt-0.5` rather than the row's
                    own gap: at the full gap it sat far enough below the
                    label to read as a rule under the tab instead of part
                    of it, and it cost the rail height on every tab to say
                    something about one. */}
                <span
                  className={`mt-0.5 h-0.5 w-8 rounded-full transition-colors ${
                    on ? "bg-accent" : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
