"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HotspotVideo, NowShowing } from "@/components/storefront/studio/HotspotVideo";
import { MaterialsList } from "@/components/storefront/studio/MaterialsList";
import { AddAllToProject } from "@/components/storefront/studio/AddAllToProject";
import { SaveSheet } from "@/components/storefront/studio/SaveSheet";
import type { StudioVideoHandle } from "@/components/storefront/studio/StudioVideo";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Cart, Chevron, Heart, HeartFilled, Pin } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { isSaved, useStudio } from "@/lib/store/studio";
import { formatPrice } from "@/lib/types/catalog";
import { ROOM_LABEL, type SpacePinView } from "@/lib/types/studio";

/**
 * One room per screen, swiped.
 *
 * `PinGrid` is the sibling: same server-rendered first page, same keyset
 * cursor, same `IntersectionObserver` sentinel for the next one. What is
 * different is that this surface has a *current* item, and almost
 * everything below is in service of that one fact.
 *
 * **Scroll snapping, not a carousel.** `snap-y snap-mandatory` on the
 * scroller and `h-dvh snap-start` on each slide. The browser does the
 * physics: momentum, rubber-banding, the trackpad, the keyboard, and the
 * scrollbar all work because this is a scroll container and not a
 * transform being driven by touch handlers. Every hand-rolled vertical
 * feed reimplements those four things and gets at least one wrong.
 *
 * `dvh` rather than `vh` because mobile Safari's address bar makes `vh`
 * taller than the visible window — a full-bleed clip measured in `vh` is
 * one whose bottom controls sit behind the browser chrome.
 *
 * **Exactly one clip plays.** An observer marks the slide that is mostly
 * on screen, and `active` on every other `StudioVideo` pauses it, rewinds
 * it and stops it buffering. A feed that keeps three videos running is a
 * feed that empties a battery and a data pack to show one room — and on
 * this surface, unlike the wall, the reader has not chosen the ones above
 * and below at all.
 *
 * **The materials come with the page, not with the tap.** See
 * `listWatchFeed`: a viewer watching somebody point at a tap has a second
 * or two in which "what is that" is live, and a round trip spends it.
 */
export function WatchFeed({
  initial,
  initialCursor,
}: {
  initial: SpacePinView[];
  initialCursor: string | null;
}) {
  const [pins, setPins] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(
    initial[0]?.pin.id ?? null,
  );

  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/studio/watch?cursor=${encodeURIComponent(cursor)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load more");

      const data = body.data as { pins: SpacePinView[]; nextCursor: string | null };

      /* Deduplicated by id, exactly as the wall does it — keyset
         pagination cannot repeat a row on its own, but a duplicate key is
         a React error rather than a cosmetic one. */
      setPins((current) => {
        const seen = new Set(current.map((p) => p.pin.id));
        return [...current, ...data.pins.filter((p) => !seen.has(p.pin.id))];
      });
      setCursor(data.nextCursor);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  }, [cursor, loading]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      /* The scroller, not the viewport: this container scrolls, the page
         behind it does not, and an observer rooted on the window would
         never see the sentinel move. Two screens of margin, so the next
         page is in flight while the reader is still on the second-to-last
         clip. */
      { root: scroller.current, rootMargin: "200% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  /* ---- Which clip is on screen ---- */
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;

    const slides = root.querySelectorAll<HTMLElement>("[data-pin-id]");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          /* A single threshold, over half. With snapping there is only
             ever one slide past 50% except mid-swipe, so this cannot
             flicker between two — and using "most visible wins" would
             need every slide's ratio recomputed on every tick to answer
             a question the snap has already answered. */
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.pinId;
            if (id) setActiveId(id);
          }
        }
      },
      { root, threshold: 0.6 },
    );

    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [pins]);

  return (
    <div
      ref={scroller}
      className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-deep"
    >
      {/* Back, over everything. This surface has no header of its own —
          the whole point is that the room fills the screen — and without
          this the only way out on a phone is the browser's own gesture,
          which not every reader arrived here with. */}
      <Link
        href="/studio"
        aria-label="Back to Studio"
        /* `top` with the inset folded in, not the `safe-top` utility:
           that one adds *padding*, which on a fixed circle grows the
           circle instead of moving it. */
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        className="fixed left-3 z-30 grid size-10 place-items-center rounded-full bg-photo-cta/80 text-on-photo-cta backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Chevron className="size-5 rotate-180" />
      </Link>

      {pins.map((view) => (
        <WatchSlide
          key={view.pin.id}
          view={view}
          active={activeId === view.pin.id}
        />
      ))}

      <div ref={sentinel} className="h-px" aria-hidden />

      {loading && (
        <div className="grid h-24 place-items-center text-on-photo-cta">
          <Spinner />
        </div>
      )}

      {error && (
        <div className="px-5 py-8">
          <ErrorState
            compact
            title="We could not load more rooms"
            description={error}
            retry={() => {
              setError(null);
              void loadMore();
            }}
          />
        </div>
      )}

      {!cursor && !loading && (
        <div className="flex h-dvh snap-start flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-display text-title text-on-photo-cta">
            That is every room on film.
          </p>
          <p className="max-w-sm text-body-sm text-on-photo-cta/70">
            There are more of them photographed than filmed. The wall has the
            rest, priced the same way.
          </p>
          <Button href="/studio" variant="outline">
            Back to the wall
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * One room, filling the screen.
 *
 * The clip is the background and everything else is over it, which is why
 * the controls all carry their own plate: text laid straight onto an
 * unknown moving image is text that is legible in one frame and gone in
 * the next.
 *
 * `selected` is local to the slide rather than lifted: two clips are
 * never current at once, and hoisting it would make swiping between rooms
 * carry the previous room's highlighted line into the next one's list.
 */
function WatchSlide({ view, active }: { view: SpacePinView; active: boolean }) {
  const { pin, materials, totalPaise } = view;
  const { savedOverride, unsave, signedIn } = useStudio();
  const toast = useToast();

  const [selected, setSelected] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const clip = useRef<StudioVideoHandle | null>(null);

  const saved = isSaved(pin, savedOverride(pin.id));
  const line = materials.find((m) => m.number === selected) ?? null;

  async function onSaveClick() {
    if (!signedIn) {
      window.location.href = `/signin?next=${encodeURIComponent("/studio/watch")}`;
      return;
    }
    if (saved) {
      try {
        await unsave(pin.id);
        toast.toast("Removed from your saves");
      } catch (problem) {
        toast.error(problem instanceof Error ? problem.message : "Could not remove");
      }
      return;
    }
    setSaveOpen(true);
  }

  /* Tapping a line seeks the clip and leaves the sheet open — the reader
     is comparing the list against the footage, and closing the thing they
     just tapped would take the list away to show them the answer. */
  function pickLine(n: number) {
    const line = materials.find((m) => m.number === n);
    if (line && line.atSeconds !== null) clip.current?.seek(line.atSeconds);
    setSelected(n);
  }

  return (
    <section
      data-pin-id={pin.id}
      aria-label={pin.title}
      className="relative h-dvh snap-start snap-always"
    >
      {pin.video && (
        <HotspotVideo
          pin={pin}
          video={pin.video}
          materials={materials}
          selected={selected}
          onSelect={setSelected}
          handleRef={clip}
          active={active}
          fill
        />
      )}

      {/* Everything over the clip, in one bottom-anchored stack.
          Anchoring the caption, the rail and the "showing now" chip
          separately is three things measured from the same edge and one
          long product title away from overlapping — so there is one
          column here, and the order in it is the order they matter:
          what is on screen now, what this room is, and how to buy it.

          `max(1rem, safe-area)` rather than the `safe-bottom` utility:
          that one *sets* the padding, and would quietly shrink this to
          8px on every phone without a home indicator. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-gradient-to-t from-deep/85 via-deep/40 to-transparent px-4 pt-16"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-end justify-between gap-3">
          <div className="pointer-events-auto flex min-w-0 flex-1 flex-col gap-2">
            {line && (
              <NowShowing line={line} onSelect={() => setSelected(line.number)} />
            )}

            <h2 className="font-display text-title font-light text-on-photo-cta">
              <Link href={`/studio/pin/${pin.slug}`} className="hover:underline">
                {pin.title}
              </Link>
            </h2>

            {(pin.location || pin.room || pin.designer) && (
              <p className="flex flex-wrap items-center gap-x-1.5 text-body-sm text-on-photo-cta/80">
                <Pin className="size-3.5 shrink-0" />
                {pin.location ?? (pin.room ? ROOM_LABEL[pin.room] : null)}
                {pin.designer && (
                  <>
                    <span aria-hidden>·</span>
                    <Link
                      href={`/studio/designers/${pin.designer.slug}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {pin.designer.name}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>

          {/* The rail. Right-hand side, thumb height — not fashion: on a
              6-inch phone held one-handed it is the only part of the
              screen a thumb reaches without regripping. */}
          <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-3">
            <button
              type="button"
              onClick={onSaveClick}
              aria-pressed={saved}
              aria-label={
                saved ? `Remove ${pin.title} from saves` : `Save ${pin.title}`
              }
              className="tap-target grid size-12 place-items-center rounded-full bg-photo-cta/80 text-on-photo-cta backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {saved ? (
                <HeartFilled className="size-6 text-accent" />
              ) : (
                <Heart className="size-6" />
              )}
            </button>
            {pin.saveCount > 0 && (
              <span className="nums -mt-2 text-micro text-on-photo-cta/80">
                {pin.saveCount}
              </span>
            )}
          </div>
        </div>

        {materials.length > 0 && (
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className={cn(
              "pointer-events-auto flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-plate-solid px-4 text-body-sm font-medium text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            )}
          >
            <Cart className="size-4" />
            Shop this room · {materials.length}{" "}
            {materials.length === 1 ? "item" : "items"}
            <span className="nums text-muted">{formatPrice(totalPaise)}</span>
          </button>
        )}
      </div>

      {/* Mounted only while open — one drawer per open sheet, not one per
          slide waiting in the DOM behind a feed that may be forty long. */}
      {listOpen && (
        <Drawer
          open={listOpen}
          onClose={() => setListOpen(false)}
          side="bottom"
          title={pin.title}
          description="Everything in this room, at today's list price"
          footer={
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-caption text-muted">At today&rsquo;s list price</p>
                <p className="nums font-display text-title-sm font-semibold text-ink">
                  {formatPrice(totalPaise)}
                </p>
              </div>
              <Button onClick={() => setProjectOpen(true)}>Add all to project</Button>
            </div>
          }
        >
          <MaterialsList
            materials={materials}
            selected={selected}
            onSelect={pickLine}
          />
        </Drawer>
      )}

      {saveOpen && (
        <SaveSheet idea={pin} open={saveOpen} onClose={() => setSaveOpen(false)} />
      )}

      {projectOpen && (
        <AddAllToProject
          open={projectOpen}
          onClose={() => setProjectOpen(false)}
          materials={materials}
          roomName={pin.title}
          totalPaise={totalPaise}
        />
      )}
    </section>
  );
}
