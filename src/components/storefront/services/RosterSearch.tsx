"use client";

import { useMemo, useState } from "react";
import { Search } from "@/components/icons";
import { ProfessionalRail } from "@/components/storefront/home/ProfessionalRail";
import type { Professional } from "@/lib/data/professionals";

/**
 * Search the roster, not the catalogue.
 *
 * The header's search field looks like the search on this page and is
 * not: it opens the product palette, so typing "plumber" into it on the
 * page listing plumbers returned bathroom fittings. One field that
 * searches two different things depending on which page you are standing
 * on is worse than two fields, so this is the second field, and it is
 * attached to the list it filters.
 *
 * ## Filtered here rather than on the server
 *
 * Thirty people is a few kilobytes and they are already on the page. A
 * round trip per keystroke would be slower, would need a debounce to be
 * bearable, and would make an empty result indistinguishable from a slow
 * one. When the roster is large enough that shipping it all is the wrong
 * trade, this becomes a query against the database and the input stays
 * exactly as it is.
 *
 * Matching is on the three things a customer actually knows: who, what
 * trade, and where. Not on the booking slug — "installation" is how
 * carpentry is filed, not what anybody would type.
 */
export function RosterSearch({ people }: { people: Professional[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((person) =>
      [person.name, person.trade, person.area ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [people, query]);

  return (
    <div>
      <div className="px-5 lg:px-0">
        <label className="flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-3 focus-within:border-accent">
          <Search className="size-5 shrink-0 text-muted" />
          <span className="sr-only">Search the roster</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, trade or area"
            /* `[&::-webkit-search-cancel-button]:hidden` because Safari's
               own clear button sits on the pill's right edge and reads as
               a second control. The field clears by selecting and
               deleting, like every other field on the site. */
            className="min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
          />
        </label>

        {/* Announced, so a screen reader is told the list changed under
            it — a filtered list that updates silently is one a
            non-sighted reader has to go and check. */}
        <p aria-live="polite" className="mt-2 text-caption text-muted">
          {query.trim()
            ? `${results.length} of ${people.length} ${people.length === 1 ? "person" : "people"}`
            : `${people.length} ${people.length === 1 ? "person" : "people"}`}
        </p>
      </div>

      {results.length > 0 ? (
        <div className="mt-4">
          <ProfessionalRail people={results} layout="list" />
        </div>
      ) : (
        <p className="mt-6 px-5 text-body-sm text-muted lg:px-0">
          Nobody on the roster matches “{query.trim()}”. Quoin books ten
          trades — try a trade name, or the locality you are building in.
        </p>
      )}
    </div>
  );
}
