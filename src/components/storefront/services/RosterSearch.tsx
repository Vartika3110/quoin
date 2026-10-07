"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "@/components/icons";
import { cn } from "@/components/ui/cn";
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
export function RosterSearch({
  people,
  leading,
  banner,
}: {
  people: Professional[];
  /**
   * Rendered to the left of the field, on the same line — the page's
   * breadcrumb, at the owner's instruction.
   *
   * It reads oddly as a prop and is right on the page: "Home › Services"
   * and the field that searches Services are one row of orientation, and
   * giving them separate lines spent two rows saying where you are
   * before the list began. The breadcrumb cannot live inside this
   * component's own file because it is the *page's* trail, not the
   * roster's.
   */
  leading?: ReactNode;
  /**
   * Rendered between the search row and the trade chips — the consult
   * band. Handed in rather than placed beside this component because it
   * belongs *inside* the order: trail and field, then the offer of a
   * call, then the filters and the list. Siblings cannot interleave like
   * that without the page knowing what this component's first row is.
   */
  banner?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState<string | null>(null);

  /* Taken from the roster rather than written out, so a trade nobody
     works disappears from the row instead of filtering to nothing. */
  const trades = useMemo(
    () => [...new Set(people.map((p) => p.trade))].sort(),
    [people],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((person) => {
      if (trade && person.trade !== trade) return false;
      if (!q) return true;
      return [person.name, person.trade, person.area ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [people, query, trade]);

  return (
    <div>
      <div className="flex items-center gap-3 px-5 lg:px-0">
        {leading ? <div className="shrink-0">{leading}</div> : null}

        {/* `min-w-0 flex-1` so the field takes what the trail leaves and
            the placeholder truncates rather than pushing the row wide. */}
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2.5 focus-within:border-accent">
          <Search className="size-4 shrink-0 text-muted" />
          <span className="sr-only">Search the roster</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, trade or area"
            /* `[&::-webkit-search-cancel-button]:hidden` because Safari's
               own clear button sits on the pill's right edge and reads as
               a second control. The field clears by selecting and
               deleting, like every other field on the site. */
            className="min-w-0 flex-1 bg-transparent text-caption text-ink outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
          />
        </label>

      </div>

      {banner ? <div className="mt-4">{banner}</div> : null}

      {/* The trades, as a row to tap. A chip answers the common case in
          one tap where the field above needs a word typed correctly, and
          it also *shows* what Quoin books — a customer who does not know
          the roster has tilers on it will not think to search for one. */}
      <div className="rail mt-3 gap-2 px-5 pb-1 scroll-pl-5 lg:px-0 lg:scroll-pl-0">
        <Chip label="All" on={trade === null} onClick={() => setTrade(null)} />
        {trades.map((name) => (
          <Chip
            key={name}
            label={name}
            on={trade === name}
            onClick={() => setTrade(trade === name ? null : name)}
          />
        ))}
      </div>

      <div className="px-5 lg:px-0">
        {/* Announced, so a screen reader is told the list changed under
            it — a filtered list that updates silently is one a
            non-sighted reader has to go and check. */}
        <p aria-live="polite" className="mt-3 text-caption text-muted">
          {results.length === people.length
            ? `${people.length} professionals available`
            : `${results.length} of ${people.length} professionals`}
        </p>
      </div>

      {results.length > 0 ? (
        <div className="mt-3">
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

/** One trade, as a button. `aria-pressed` rather than a checkbox: it is a
    filter the page applies immediately, not a value submitted later. */
function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "shrink-0 rounded-full border px-4 py-2 text-caption font-medium transition-colors",
        on
          ? "border-accent bg-accent text-on-accent"
          : "border-line bg-surface text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
