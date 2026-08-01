"use client";

import { useState } from "react";
import { TAB_ICONS } from "@/components/icons";
import type { CatalogTab } from "@/lib/types/catalog";

/**
 * Top-level catalogue filter. Client-side today because the fixture data
 * is already loaded; once the catalogue is served this becomes a link
 * list writing `?tab=` so each tab is shareable and crawlable.
 */
export function TabRail({ tabs }: { tabs: CatalogTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div
      role="tablist"
      aria-label="Product categories"
      className="rail gap-7 px-5 lg:gap-8 lg:px-0"
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
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 pb-2"
          >
            <Icon className={`size-7 ${on ? "text-gold" : "text-ink"}`} />
            <span
              className={`text-center text-[11px] leading-tight ${
                on ? "text-ink" : "text-muted"
              }`}
            >
              {tab.label}
            </span>
            <span
              className={`h-0.5 w-8 rounded-full transition-colors ${
                on ? "bg-gold" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
