"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DiscoveryFeed } from "@/components/storefront/studio/DiscoveryFeed";
import { Search } from "@/components/icons";
import type { IdeaView, StudioRoom } from "@/lib/types/studio";

/**
 * Searching Studio.
 *
 * A real page at a real URL, not a filter in a header. `?q=japandi` can
 * be linked, bookmarked, shared and reached with the back button, which
 * is what makes search worth having at all.
 *
 * Submitting navigates rather than fetching. The server then renders the
 * first page of results the same way `/studio` renders the feed — the
 * result is on screen in the first paint, and `DiscoveryFeed` takes over
 * for filters, tabs and pagination from there. One feed component, three
 * pages.
 *
 * Deliberately narrower than section 22 asks for. That section wants one
 * search across ideas, spaces, projects, products, materials and
 * creators. Products already have a search — the header's palette, over
 * `/api/v1/search`, which knows about category synonyms and brand
 * matching — and building a second one here that answered differently for
 * the same word would be worse than sending people to the one that
 * works. So this searches ideas, and says so, and links out for the rest.
 */
export function StudioSearch({
  query,
  initial,
  initialCursor,
  facets,
}: {
  query: string;
  initial: IdeaView[];
  initialCursor: string | null;
  facets: {
    rooms: { room: StudioRoom; count: number }[];
    styles: string[];
    materials: string[];
  };
}) {
  const router = useRouter();
  const [term, setTerm] = useState(query);

  return (
    <div className="flex flex-col gap-6">
      <header className="px-5 lg:px-0">
        {/* Every other Studio route gets its `h1` from `StudioHeader`; this
            one skips that header entirely to put the search field first, so
            without this the page would have no top-level heading at all. */}
        <h1 className="sr-only">Search Studio</h1>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const next = term.trim();
            /* `replace`, not `push`: a search refined four times should
               leave one entry in history, not four, so Back returns to
               wherever the search started. */
            router.replace(next ? `/studio/search?q=${encodeURIComponent(next)}` : "/studio/search");
          }}
        >
          <label htmlFor="studio-search" className="sr-only">
            Search inspiration
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
            {initial.length === 0
              ? `No ideas matching “${query}”.`
              : `Ideas matching “${query}”.`}{" "}
            <a
              href={`/products?q=${encodeURIComponent(query)}`}
              className="font-medium text-accent hover:underline"
            >
              Search the catalogue instead
            </a>
          </p>
        ) : null}
      </header>

      <DiscoveryFeed
        initial={initial}
        initialCursor={initialCursor}
        facets={facets}
        query={query || undefined}
      />
    </div>
  );
}
