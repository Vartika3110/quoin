"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MasonrySkeleton } from "@/components/storefront/studio/Masonry";
import { IdeaMasonry } from "@/components/storefront/studio/IdeaMasonry";
import {
  FilterRail,
  NO_FILTERS,
  countFilters,
  type Filters,
} from "@/components/storefront/studio/FilterRail";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Camera, Heart, Sparkle } from "@/components/icons";
import { useStudio } from "@/lib/store/studio";
import type { FeedTab, IdeaView, StudioRoom } from "@/lib/types/studio";

/**
 * The inspiration feed.
 *
 * ## How many tiles fit
 *
 * `sizes` is the only thing standing between this page and a phone
 * downloading forty 4000px photographs. It says: two columns below 640px,
 * three to 1024, four to 1280, five above — which is exactly what
 * `useColumnCount` lays out, and has to stay in step with it, so the
 * browser picks a source the size of the box rather than the size of the
 * original.
 *
 * ## Why the first page comes from the server
 *
 * `initial` is rendered on the server and hydrated here. Fetching page one
 * from an effect instead would mean the feed's whole purpose — a wall of
 * photographs — arrives one round trip after the page does, behind a
 * skeleton, on every single visit.
 *
 * ## Personalisation, honestly
 *
 * The "For you" tab is `listFeed`'s deterministic affinity: the rooms and
 * styles this person has already saved. It is labelled as that, in words,
 * under the tab. There is no recommendation engine behind this app and
 * nothing here implies one — see section 41 of the brief and the
 * `matchParchaLines` comment that set the precedent.
 */
const SIZES =
  "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

/** Roughly the first two rows across the widest layout. Preloading more
    than this is the same as preloading none of it. */
const PRELOAD_COUNT = 6;

interface Facets {
  rooms: { room: StudioRoom; count: number }[];
  styles: string[];
  materials: string[];
}

export function DiscoveryFeed({
  initial,
  initialCursor,
  facets,
  query,
  startTab = "new",
}: {
  initial: IdeaView[];
  initialCursor: string | null;
  facets: Facets;
  /** Which tab the server rendered `initial` for. `/studio/saved` is the
      same feed opened on a different tab, not a second component. */
  startTab?: FeedTab;
  /** A search term from `?q=`, when the feed is being used as search
      results. Filters and tabs still apply on top of it. */
  query?: string;
}) {
  const { signedIn } = useStudio();

  const [tab, setTab] = useState<FeedTab>(startTab);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const [ideas, setIdeas] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The in-flight "load more", so switching tabs can cancel it.
   *
   * One `AbortController` guards both requests this component makes. The
   * view fetch has its own, created and cleaned up inside its effect;
   * this holds the pagination request, which starts from a scroll rather
   * than from a render and so has no effect of its own to clean it up.
   * Without it, a page that was already in flight when the tab changed
   * appends Trending's photographs underneath New's heading.
   */
  const pending = useRef<AbortController | null>(null);

  const params = useMemo(() => {
    const search = new URLSearchParams();
    search.set("tab", tab);
    if (filters.room) search.set("room", filters.room);
    for (const style of filters.styles) search.append("style", style);
    for (const material of filters.materials) search.append("material", material);
    if (query) search.set("q", query);
    return search;
  }, [tab, filters, query]);

  /* The server rendered `initial` for the default tab with no filters. Any
     other combination has to be fetched, and going back to that exact
     combination should not refetch what is already on screen. */
  const isInitialView = tab === startTab && countFilters(filters) === 0;
  const viewKey = isInitialView ? "@initial" : params.toString();

  /**
   * Returning to the server's own page restores it *during render*, not
   * in an effect.
   *
   * This is React's documented "adjusting state when props change"
   * pattern, and it is the only correct shape here: an effect that calls
   * `setState` renders the stale grid once before replacing it, which on
   * a page of photographs is a visible flash of the wrong feed — and
   * React 19's `react-hooks/set-state-in-effect` rule rejects it outright.
   */
  const [renderedView, setRenderedView] = useState(viewKey);
  if (renderedView !== viewKey) {
    setRenderedView(viewKey);
    /* Both branches are set here, during render, rather than in the
       effect below. The skeleton has to be on screen in the *same* commit
       that the old grid leaves it, or switching tabs shows the previous
       feed for one frame under the new heading. */
    setError(null);
    setRefetching(!isInitialView);
    if (isInitialView) {
      setIdeas(initial);
      setCursor(initialCursor);
    }
  }

  useEffect(() => {
    /* Whatever page was still arriving belongs to the feed that was on
       screen a moment ago. Cancelled here rather than filtered at the
       point it resolves, so there is one mechanism and not two. */
    pending.current?.abort();
    pending.current = null;

    if (isInitialView) return;

    const controller = new AbortController();

    fetch(`/api/v1/studio/feed?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "Could not load ideas");
        return body.data as { ideas: IdeaView[]; nextCursor: string | null };
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setIdeas(data.ideas);
        setCursor(data.nextCursor);
        setError(null);
      })
      .catch((problem: unknown) => {
        if (controller.signal.aborted) return;
        setError(problem instanceof Error ? problem.message : "Could not load ideas");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefetching(false);
      });

    return () => controller.abort();
  }, [params, isInitialView]);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;

    const controller = new AbortController();
    pending.current = controller;

    setLoading(true);
    try {
      const next = new URLSearchParams(params);
      next.set("cursor", cursor);

      const response = await fetch(`/api/v1/studio/feed?${next}`, {
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load more");

      const data = body.data as { ideas: IdeaView[]; nextCursor: string | null };

      /* Deduplicated by id. Keyset pagination cannot repeat a row on its
         own, but a save landing between two pages can reorder the
         trending feed underneath them, and a duplicate key would be a
         React error rather than a cosmetic one. */
      setIdeas((current) => {
        const seen = new Set(current.map((i) => i.id));
        return [...current, ...data.ideas.filter((i) => !seen.has(i.id))];
      });
      setCursor(data.nextCursor);
    } catch (problem) {
      if (controller.signal.aborted) return;
      setError(problem instanceof Error ? problem.message : "Could not load more");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (pending.current === controller) pending.current = null;
    }
  }, [cursor, loading, params]);

  /* An IntersectionObserver on a sentinel below the grid, with a generous
     root margin so the next page is already arriving by the time the last
     row is reached. Scroll handlers were the other option and they fire
     on every frame. */
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

  const TABS: TabItem<FeedTab>[] = [
    { id: "new", label: "New" },
    { id: "trending", label: "Trending" },
    ...(signedIn
      ? ([
          { id: "for_you", label: "For you" },
          { id: "saved", label: "Saved" },
        ] as TabItem<FeedTab>[])
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="px-5 lg:px-0">
        <Tabs
          items={TABS}
          value={tab}
          onChange={setTab}
          label="Inspiration feed"
          variant="underline"
        />
      </div>

      {tab === "for_you" ? (
        <p className="px-5 text-caption text-faint lg:px-0">
          {/* Says exactly what the query does. Anything vaguer would read
              as a claim about a recommendation engine that does not
              exist. */}
          Rooms and styles like the ones you have saved.
        </p>
      ) : null}

      <FilterRail facets={facets} filters={filters} onChange={setFilters} />

      <div className="px-5 lg:px-0">
        {error ? (
          <ErrorState
            title="We could not load your Studio"
            description={error}
            /* A fresh object with the same contents changes the `params`
               identity, which is what the fetch effect keys on — so
               "try again" re-runs the request that failed rather than
               needing a separate retry path. */
            retry={() => setFilters({ ...filters })}
          />
        ) : refetching ? (
          <MasonrySkeleton />
        ) : ideas.length === 0 ? (
          <FeedEmpty tab={tab} filtered={countFilters(filters) > 0 || Boolean(query)} />
        ) : (
          <>
            <IdeaMasonry
              ideas={ideas}
              label="Inspiration"
              sizes={SIZES}
              preloadCount={PRELOAD_COUNT}
            />

            <div ref={sentinel} className="h-px" aria-hidden />

            {loading ? (
              <p className="flex items-center justify-center gap-2 py-8 text-body-sm text-muted">
                <Spinner className="size-4" />
                Loading more
              </p>
            ) : !cursor && ideas.length > 12 ? (
              <p className="py-10 text-center text-body-sm text-faint">
                That is everything for now.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Nothing to show.
 *
 * Four different reasons, four different things to say. A filter that
 * matched nothing is not the same event as an empty Studio, and telling
 * someone to "start collecting ideas" when they have forty and simply
 * picked two chips that do not overlap is how an empty state reads as a
 * bug.
 */
function FeedEmpty({ tab, filtered }: { tab: FeedTab; filtered: boolean }) {
  if (filtered) {
    return (
      <EmptyState
        icon={<Sparkle className="size-6" />}
        title="Nothing matches those filters"
        compact
      >
        Try removing one, or search for something else.
      </EmptyState>
    );
  }

  if (tab === "saved") {
    return (
      <EmptyState
        icon={<Heart className="size-6" />}
        title="No saved ideas yet"
        action={{ href: "/studio", label: "Discover inspiration" }}
      >
        Save what you like and it will be here, on every device you sign in on.
      </EmptyState>
    );
  }

  if (tab === "for_you") {
    return (
      <EmptyState
        icon={<Sparkle className="size-6" />}
        title="Save a few ideas first"
        action={{ href: "/studio", label: "Browse everything" }}
      >
        This tab shows more of what you have already saved, so it needs a
        starting point.
      </EmptyState>
    );
  }

  return (
    <EmptyState
      icon={<Camera className="size-6" />}
      title="No inspiration here yet"
      action={{ href: "/studio/upload", label: "Add the first photograph" }}
      secondaryAction={{ href: "/products", label: "Browse the catalogue" }}
    >
      Studio fills up with rooms people have actually built. Upload a photograph
      of one and it becomes the first.
    </EmptyState>
  );
}
