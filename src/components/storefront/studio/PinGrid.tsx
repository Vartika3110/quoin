"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Masonry, MasonrySkeleton } from "@/components/storefront/studio/Masonry";
import { PinCard } from "@/components/storefront/studio/PinCard";
import { ErrorState } from "@/components/ui/ErrorState";
import type { IdeaView } from "@/lib/types/studio";

/**
 * The wall.
 *
 * The first page is rendered on the server and handed in as `initial`;
 * everything after it is appended here as the reader reaches the bottom.
 * Filters are *not* state in this component — they are the URL, so
 * changing one is a navigation that re-renders the page on the server
 * with a new `initial`, and `queryString` is only ever used to ask for
 * the *next* page of whatever is already on screen.
 *
 * That split is what makes `key` unnecessary and the back button work: a
 * reader who filters to kitchens, scrolls four pages, opens a pin and
 * comes back gets the server's first page again, which is the same thing
 * every other page in this app does on a back navigation.
 *
 * ## Why the sentinel is not a scroll handler
 *
 * An `IntersectionObserver` on an element below the grid, with a generous
 * root margin so the next page is already in flight by the time the last
 * row is on screen. A scroll handler fires on every frame and has to be
 * throttled, and a throttled scroll handler is an intersection observer
 * with worse timing.
 */
const SIZES =
  "(min-width: 1440px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw";

/** Roughly the first two rows across the widest layout. Preloading more
    than this is the same as preloading none of it. */
const PRELOAD_COUNT = 6;

export function PinGrid({
  initial,
  initialCursor,
  queryString,
  label,
  /** Rendered when the filters found nothing. The page owns the words,
      because "no kitchens in oak" and "you have saved nothing" are
      different events and this component cannot tell them apart. */
  empty,
}: {
  initial: IdeaView[];
  initialCursor: string | null;
  /** The feed query these pins came from, without a cursor. */
  queryString: string;
  label: string;
  empty: React.ReactNode;
}) {
  const [pins, setPins] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The server's page, adopted during render rather than in an effect.
   *
   * A filter change is a navigation: the same component instance is
   * re-rendered with new props, and without this it would keep showing
   * the previous filter's pins until an effect replaced them — one
   * frame of the wrong grid under the new heading. React's documented
   * "adjusting state when props change" pattern, and the shape
   * `DiscoveryFeed` already uses for the same reason; an effect here
   * would also be rejected outright by `set-state-in-effect`.
   */
  const [renderedFor, setRenderedFor] = useState(queryString);
  if (renderedFor !== queryString) {
    setRenderedFor(queryString);
    setPins(initial);
    setCursor(initialCursor);
    setError(null);
  }

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const next = new URLSearchParams(queryString);
      next.set("cursor", cursor);

      const response = await fetch(`/api/v1/studio/feed?${next}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load more");

      const data = body.data as { ideas: IdeaView[]; nextCursor: string | null };

      /* Deduplicated by id. Keyset pagination cannot repeat a row on its
         own, but a save landing between two pages reorders the trending
         feed underneath them, and a duplicate key is a React error rather
         than a cosmetic one. */
      setPins((current) => {
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...data.ideas.filter((p) => !seen.has(p.id))];
      });
      setCursor(data.nextCursor);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, queryString]);

  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  if (pins.length === 0) return <>{empty}</>;

  return (
    <div className="px-5 lg:px-0">
      <Masonry
        items={pins}
        label={label}
        keyOf={keyOf}
        ratioOf={ratioOf}
        render={(pin, index) => (
          <PinCard idea={pin} sizes={SIZES} preload={index < PRELOAD_COUNT} />
        )}
      />

      <div ref={sentinel} className="h-px" aria-hidden />

      {/* A skeleton row, never a bare spinner. The next page is a wall of
          photographs and the shape it will take is known — a spinner
          throws away that information and makes the page look like it
          has stopped rather than like it is filling. */}
      {loading && (
        <div className="mt-4">
          <MasonrySkeleton count={8} />
        </div>
      )}

      {error && (
        <ErrorState
          className="mt-6"
          compact
          title="We could not load more rooms"
          description={error}
          retry={() => {
            setError(null);
            void loadMore();
          }}
        />
      )}

      {!cursor && !loading && pins.length > 12 && (
        <p className="py-10 text-center text-body-sm text-faint">
          That is everything for now.
        </p>
      )}
    </div>
  );
}

/* Module-level, not inline arrows: `Masonry` memoises the whole column
   assignment on their identity, and a fresh arrow per render would
   recompute the layout every time anything above it changed. */
const keyOf = (pin: IdeaView) => pin.id;
const ratioOf = (pin: IdeaView) => pin.height / pin.width;
