"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Box,
  Chevron,
  Close,
  EnterKey,
  Grid,
  Package,
  Search,
  Tag,
} from "@/components/icons";
import { Spinner } from "@/components/ui/Spinner";
import { VoiceSearch } from "@/components/storefront/nav/VoiceSearch";
import { cn } from "@/components/ui/cn";
import {
  clearRecentSearches,
  pushRecentSearch,
  readRecentSearches,
} from "@/lib/store/recent-searches";
import type { SearchSuggestions, Suggestion } from "@/lib/data/search";

/**
 * Search across Quoin.
 *
 * A command palette rather than a text field with a dropdown, because
 * what people search for here is not only products: "bathroom" is a
 * department, "Jaquar" is a brand, "parcha" is a tool, and a plain product
 * search answers one of the three. Grouping the results by what they *are*
 * is what makes one box able to answer all of them.
 *
 * The interaction contract, which is the part that has to be right:
 *
 *   ⌘K / Ctrl-K   open from anywhere
 *   /             open, unless the caret is already in a field
 *   Esc           close, restoring focus to whatever opened it
 *   ↑ ↓           move through every result, across group boundaries
 *   Enter         go to the highlighted result, or search for the text
 *
 * Voice input sits beside the field where the platform supports it, which
 * matters more here than on most storefronts: the person searching often
 * has one hand free and dusty, and "hafele concealed hinge" is a miserable
 * thing to thumb-type.
 *
 * Requests are debounced at 180ms and every response carries the term it
 * was for, so a slow answer for "ti" cannot overwrite a fast one for
 * "tile" — the classic out-of-order autocomplete bug.
 */

const DEBOUNCE_MS = 180;

const EMPTY: SearchSuggestions = {
  categories: [],
  brands: [],
  products: [],
  destinations: [],
  flat: [],
};

const KIND_ICON = {
  product: Package,
  category: Grid,
  brand: Tag,
  destination: Box,
} as const;

export function SearchPalette({
  open,
  onClose,
  /** Shown before anything is typed. Real categories, not invented terms. */
  suggestedTerms,
}: {
  open: boolean;
  onClose: () => void;
  suggestedTerms: string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchSuggestions>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  /* Bumped when the customer clears their recents, which is the only
     thing that changes the list while the palette is open. */
  const [recentsToken, setRecentsToken] = useState(0);

  /* Everything that happens when the palette opens or closes, in one
     effect. Recents are read on *open* rather than on mount, because the
     palette stays mounted across navigations and a list captured once
     would go stale the first time someone searched.

     Resetting on close is done here rather than by unmounting so the
     closing animation has something to animate. */
  useEffect(() => {
    if (!open) return;

    opener.current = document.activeElement as HTMLElement | null;

    /* One frame, so the input exists before focus is asked for. */
    const frame = requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      opener.current?.focus?.();
      setTerm("");
      setResults(EMPTY);
      setCursor(0);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
    };
  }, [open]);

  /* The query. `ignore` guards against a stale response landing after a
     newer one; `AbortController` cancels the request itself so a fast
     typist does not queue eight in flight. */
  useEffect(() => {
    const q = term.trim();
    /* Nothing to ask for yet. Returning without touching state matters:
       what is *shown* is derived from `typed` below, so there is no stale
       list to clear and no cascading render to cause. */
    if (q.length < 2) return;

    let ignore = false;
    const controller = new AbortController();

    /* The spinner is raised inside the debounce rather than beside it, so
       that a fast typist does not flash it on every keystroke — and so
       nothing sets state synchronously in the effect body. */
    const timer = window.setTimeout(async () => {
      if (ignore) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data: SearchSuggestions };
        if (!ignore) {
          setResults(body.data);
          setCursor(0);
        }
      } catch {
        /* A failed suggestion request is not an error worth showing: the
           customer can still press Enter and get the full results page,
           which is the same thing they would do with an empty list. */
        if (!ignore) setResults(EMPTY);
      } finally {
        if (!ignore) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      ignore = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term]);

  const go = useCallback(
    (href: string, remember?: string) => {
      if (remember) pushRecentSearch(remember);
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const searchAll = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      go(`/products?q=${encodeURIComponent(trimmed)}`, trimmed);
    },
    [go],
  );

  /* Read during render rather than in an effect: `open` and the clear
     token are the only inputs, and a `setState` here would be a cascading
     render on every open. */
  const recent = useMemo(
    () => (open ? readRecentSearches() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `recentsToken` is the invalidation signal
    [open, recentsToken],
  );

  const flat = results.flat;
  /* "Search across Quoin" is the last row, and part of the same keyboard
     ring — it is the fallback when nothing listed is what you meant. */
  const rowCount = flat.length + (term.trim().length >= 2 ? 1 : 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rowCount === 0) return;
      setCursor((c) =>
        e.key === "ArrowDown" ? (c + 1) % rowCount : (c - 1 + rowCount) % rowCount,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[cursor];
      if (hit) go(hit.href, term);
      else searchAll(term);
    }
  };

  /* Keep the highlighted row in view when the arrows walk past the fold. */
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const groups = useMemo(
    () =>
      [
        { title: "Go to", items: results.destinations },
        { title: "Categories", items: results.categories },
        { title: "Brands", items: results.brands },
        { title: "Products", items: results.products },
      ].filter((g) => g.items.length > 0),
    [results],
  );

  if (!open || typeof document === "undefined") return null;

  const typed = term.trim().length >= 2;
  /* Below two characters the last response is stale by definition, so the
     groups are hidden rather than cleared — same outcome, no state. */
  const nothing = typed && !loading && flat.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-start justify-center">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="anim-fade absolute inset-0 cursor-default bg-scrim backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Quoin"
        onKeyDown={onKeyDown}
        /* Sits high rather than centred: the list grows downward, and a
           vertically centred palette moves the input as results arrive. */
        className="anim-scale-in relative mt-[8vh] flex max-h-[80vh] w-[min(42rem,calc(100vw_-_2rem))] flex-col overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-line-soft px-4">
          <Search className="size-5 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={flat[cursor] ? `sr-${flat[cursor].id}` : undefined}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search products, brands, categories and services"
            className="h-14 min-w-0 flex-1 bg-transparent text-body-lg text-ink outline-none placeholder:text-faint"
          />
          {typed && loading && (
            <Spinner className="size-4 shrink-0 text-muted" />
          )}

          {/* Renders nothing where the Web Speech API is absent. */}
          <VoiceSearch onTranscript={(text) => setTerm(text)} />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <Close className="size-5" />
          </button>
        </div>

        <div
          ref={listRef}
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {!typed && (
            <BeforeTyping
              recent={recent}
              suggested={suggestedTerms}
              onPick={(t) => setTerm(t)}
              onClearRecent={() => {
                clearRecentSearches();
                setRecentsToken((n) => n + 1);
              }}
            />
          )}

          {nothing && (
            <p className="px-3 py-10 text-center text-body-sm text-muted">
              Nothing matched <span className="text-ink">“{term.trim()}”</span>.
              <br />
              Press Enter to search the whole catalogue.
            </p>
          )}

          {typed &&
            groups.map((group) => (
              <section key={group.title} className="mb-2">
                <h3 className="px-3 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-faint">
                  {group.title}
                </h3>
                <ul>
                  {group.items.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      active={flat[cursor]?.id === item.id}
                      onHover={() =>
                        setCursor(flat.findIndex((f) => f.id === item.id))
                      }
                      onPick={() => go(item.href, term)}
                    />
                  ))}
                </ul>
              </section>
            ))}

          {typed && (
            <button
              type="button"
              data-active={cursor === flat.length}
              onMouseEnter={() => setCursor(flat.length)}
              onClick={() => searchAll(term)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                cursor === flat.length ? "bg-accent-wash" : "hover:bg-hover",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
                <Search className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-body text-ink">
                Search across Quoin for{" "}
                <span className="font-semibold">“{term.trim()}”</span>
              </span>
              <Chevron className="size-4 shrink-0 text-faint" />
            </button>
          )}
        </div>

        <footer className="hidden items-center gap-4 border-t border-line-soft px-4 py-2.5 text-micro text-faint sm:flex">
          <Hint keys={["↑", "↓"]}>Navigate</Hint>
          <Hint keys={["↵"]} icon={<EnterKey className="size-3" />}>
            Open
          </Hint>
          <Hint keys={["Esc"]}>Close</Hint>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Row({
  item,
  active,
  onHover,
  onPick,
}: {
  item: Suggestion;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const Icon = KIND_ICON[item.kind];

  return (
    <li>
      <button
        type="button"
        role="option"
        id={`sr-${item.id}`}
        aria-selected={active}
        data-active={active}
        onMouseEnter={onHover}
        onClick={onPick}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
          active ? "bg-accent-wash" : "hover:bg-hover",
        )}
      >
        {item.photo ? (
          <Image
            src={item.photo}
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-lg border border-photo-edge bg-photo object-cover"
          />
        ) : (
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              active ? "bg-accent text-on-accent" : "bg-raised text-muted",
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-ink">{item.label}</span>
          {item.sublabel && (
            <span className="block truncate text-micro text-muted">
              {item.sublabel}
            </span>
          )}
        </span>
        <Chevron
          className={cn(
            "size-4 shrink-0 transition-colors",
            active ? "text-accent" : "text-faint",
          )}
        />
      </button>
    </li>
  );
}

function BeforeTyping({
  recent,
  suggested,
  onPick,
  onClearRecent,
}: {
  recent: string[];
  suggested: string[];
  onPick: (term: string) => void;
  onClearRecent: () => void;
}) {
  return (
    <div className="pb-2">
      {recent.length > 0 && (
        <section className="mb-2">
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <h3 className="text-micro font-semibold uppercase tracking-wide text-faint">
              Recent
            </h3>
            <button
              type="button"
              onClick={onClearRecent}
              className="text-micro text-muted transition-colors hover:text-accent"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 pt-1">
            {recent.map((t) => (
              <Chip key={t} onClick={() => onPick(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="px-3 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-faint">
          {/* "Suggested", not "Popular". Nothing here is measured against
              real search volume yet, and a made-up popularity ranking is a
              claim the product cannot back. */}
          Suggested
        </h3>
        <div className="flex flex-wrap gap-1.5 px-3 pt-1">
          {suggested.map((t) => (
            <Chip key={t} onClick={() => onPick(t)}>
              {t}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

function Chip({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-line-soft bg-raised px-3 py-1.5 text-caption text-muted transition-colors hover:border-accent-edge hover:bg-accent-wash hover:text-accent"
    >
      {children}
    </button>
  );
}

function Hint({
  keys,
  icon,
  children,
}: {
  keys: string[];
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {keys.map((k) => (
        <kbd
          key={k}
          className="grid h-5 min-w-5 place-items-center rounded border border-line-soft bg-raised px-1 font-sans text-micro text-muted"
        >
          {icon ?? k}
        </kbd>
      ))}
      {children}
    </span>
  );
}
