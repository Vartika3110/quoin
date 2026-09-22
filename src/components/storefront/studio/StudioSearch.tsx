"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "@/components/icons";
import { StudioFilters } from "@/components/storefront/studio/StudioFilters";
import { PinGrid } from "@/components/storefront/studio/PinGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sparkle } from "@/components/icons";
import type { RoomFacet } from "@/lib/data/studio";
import type { IdeaView } from "@/lib/types/studio";
import { toQueryString, type StudioFilters as Filters } from "@/lib/studio/query";

/**
 * Searching Studio.
 *
 * The same wall, the same three filter rows and the same masonry as
 * `/studio` — this page adds a field and a term, and nothing else. It
 * used to be a different component with its own tab strip and its own
 * filter rail, which is how a search page and the page it searches start
 * disagreeing about what a filter does.
 *
 * The first result is server-rendered, so it is on screen in the first
 * paint rather than one round trip after it.
 */
export function StudioSearch({
  query,
  initial,
  initialCursor,
  facets,
  filters,
  resultCount,
}: {
  query: string;
  initial: IdeaView[];
  initialCursor: string | null;
  facets: { rooms: RoomFacet[]; styles: string[]; materials: string[] };
  filters: Filters;
  resultCount: number;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(query);

  return (
    <div className="flex flex-col gap-5">
      <header className="px-5 lg:px-0">
        {/* Every other Studio route gets its `h1` from `StudioChrome`; this
            one skips the masthead entirely to put the field first, so
            without this the page would have no top-level heading at all. */}
        <h1 className="sr-only">Search Studio</h1>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const next = term.trim();
            /* Carries the filters across, so refining a search does not
               silently drop the room somebody already chose. `replace`,
               not `push`: a search refined four times should leave one
               entry in history, not four. */
            const search = toQueryString(
              { ...filters, q: next || null },
            );
            router.replace(search ? `/studio/search?${search}` : "/studio/search");
          }}
        >
          <label htmlFor="studio-search" className="sr-only">
            Search rooms
          </label>
          <div className="flex h-12 max-w-xl items-center gap-3 rounded-full border border-line bg-surface px-5 shadow-xs focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
            <Search className="size-4 shrink-0 text-faint" />
            <input
              id="studio-search"
              type="search"
              value={term}
              autoFocus
              maxLength={120}
              placeholder="modern kitchen, brass, japandi…"
              onChange={(event) => setTerm(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-faint"
            />
          </div>
        </form>

        {query ? (
          <p className="mt-3 text-body-sm text-muted">
            Rooms matching &ldquo;{query}&rdquo;.{" "}
            <a
              href={`/products?q=${encodeURIComponent(query)}`}
              className="font-medium text-accent hover:underline"
            >
              Search the catalogue instead
            </a>
          </p>
        ) : null}
      </header>

      <StudioFilters facets={facets} filters={filters} resultCount={resultCount} />

      <PinGrid
        initial={initial}
        initialCursor={initialCursor}
        queryString={toQueryString(filters, { tab: "new" })}
        label="Search results"
        empty={
          <EmptyState
            icon={<Sparkle className="size-6" />}
            title={query ? `Nothing matching “${query}”` : "Nothing matches those filters"}
            action={{ href: "/studio", label: "Browse every room" }}
            compact
          >
            Studio searches the room titles and the tags on them. The catalogue
            is a different search — the link above the grid goes there.
          </EmptyState>
        }
      />
    </div>
  );
}
