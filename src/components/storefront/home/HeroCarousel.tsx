"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The hero's slides, and the dots under them.
 *
 * A scroll container with CSS snap points, not a transform-driven
 * slider. The browser already knows how to carry a finger across a row
 * of panels — momentum, rubber-banding at the ends, the trackpad, the
 * arrow keys once the track has focus — and a JavaScript slider has to
 * reimplement all of it, usually worse. What is left for this component
 * is the two things scroll snap cannot do by itself: say which panel is
 * in view, and move to one when a dot is pressed.
 *
 * **The slides are server-rendered and handed in as children.** The
 * pictures are `next/image` with `priority` on the first, and the words
 * are static; none of that wants a client bundle. Only the dots and the
 * timer are interactive, so only they are in one.
 *
 * **It stops at the first sign of a reader.** Auto-advance is how a
 * carousel loses the thing somebody was reading, so it pauses on hover,
 * on focus inside the track, and permanently the moment anyone scrolls
 * it by hand — once a person has chosen a slide, moving it under them
 * is the carousel arguing with its reader. It never starts at all under
 * `prefers-reduced-motion`, where an animation nobody asked for is the
 * whole thing that setting is about.
 *
 * Advancing stops at the last slide rather than looping back to the
 * first. A loop needs cloned slides or a scroll jump to fake it, and
 * both make the scrollbar lie about where the reader is.
 */

/** Long enough to read two lines and a button before it moves. */
const ADVANCE_MS = 7000;

export function HeroCarousel({
  children,
  label,
}: {
  children: ReactNode[];
  /** Names the group for a screen reader: "Quoin" tells it nothing. */
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  /* Set once and never unset: a reader who has taken hold of the track
     has said what they want to look at. */
  const [taken, setTaken] = useState(false);
  const count = children.length;

  const goTo = useCallback((index: number) => {
    const el = track.current;
    if (!el) return;
    /* `scrollTo` on the track rather than `scrollIntoView` on the slide:
       the latter also scrolls the *page* to bring the hero into view,
       which yanks the whole document when somebody taps a dot after
       scrolling past. */
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }, []);

  /* Which slide is in view, read from the scroll position. Rounded, so
     a half-dragged slide snapping back does not flicker the dots. */
  useEffect(() => {
    const el = track.current;
    if (!el) return;

    let frame = 0;
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = track.current;
        if (!el || el.clientWidth === 0) return;
        setActive(Math.round(el.scrollLeft / el.clientWidth));
      });
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (taken || paused || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      const el = track.current;
      if (!el || el.clientWidth === 0) return;
      const next = Math.round(el.scrollLeft / el.clientWidth) + 1;
      /* Stop at the end rather than looping — see the note above. */
      if (next >= count) {
        window.clearInterval(timer);
        return;
      }
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [taken, paused, count]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={track}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        /* `onPointerDown` and not `onScroll`: the auto-advance scrolls
           the track itself, so treating any scroll as a reader's would
           have the carousel switch itself off on its own first move. */
        onPointerDown={() => setTaken(true)}
        onKeyDown={() => setTaken(true)}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((slide, i) => (
          <div
            key={i}
            className="w-full shrink-0 snap-start"
            /* Hidden from assistive tech while off-screen, so a screen
               reader is not read three competing headlines in a row. */
            aria-hidden={i !== active}
          >
            {slide}
          </div>
        ))}
      </div>

      {count > 1 && (
        /* Over the card's bottom edge, centred, where the reference puts
           them. A tap target of 44px around a 6px dot — the dot is the
           drawing, not the button. */
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1 lg:bottom-5">
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setTaken(true);
                goTo(i);
              }}
              aria-label={`Slide ${i + 1} of ${count}`}
              aria-current={i === active}
              className="grid size-7 place-items-center"
            >
              <span
                aria-hidden
                className={
                  "block h-1.5 rounded-full transition-all duration-300 " +
                  (i === active ? "w-5 bg-ink" : "w-1.5 bg-ink/35")
                }
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
