"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Chevron } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * The phone's first screen: three banners on a swipe.
 *
 * A native scroll container with snap points rather than a transform
 * carousel. The swipe is then the platform's own — it tracks the finger,
 * it rubber-bands at the ends, it works before hydration, and the dots
 * are read *from* the scroll position rather than driving it. A JS
 * carousel has to reimplement all of that and gets the momentum wrong.
 *
 * Auto-advance stops for good the moment someone swipes. A carousel that
 * keeps moving under a reader who has deliberately gone back to slide one
 * is the most user-hostile pattern on a storefront, and "pause for eight
 * seconds then resume" is the same thing with extra steps.
 *
 * Every slide is a claim Quoin can stand behind — the brands are real,
 * the services are bookable against a real slot, and the parcha reader
 * exists. Nothing here advertises a discount nobody has approved.
 */
/**
 * Three lines each, and each line short enough to hold one at 375px. The
 * banner's height is fixed by its aspect ratio, so a line that wraps is a
 * fourth line, and a fourth line pushes the call to action out of the
 * frame — which is why the copy is written to the measure rather than the
 * measure stretched to the copy.
 */
const SLIDES = [
  {
    id: "brands",
    href: "/products",
    image: "/hero/under-construction.webp",
    lines: ["Repair.", "Renovate.", "Reimagine."],
    script: "Sorted in Minutes.",
    cta: "Explore Top Brands",
  },
  {
    id: "services",
    href: "/services",
    image: "/categories/services.webp",
    lines: ["Book a pro.", "Real slots.", "Real trades."],
    script: "Booked in Minutes.",
    cta: "Find a Service",
  },
  {
    id: "parcha",
    href: "/upload",
    image: "/categories/cement-steel.webp",
    lines: ["Snap it.", "Skip typing.", "Know the rate."],
    script: "Priced in Minutes.",
    cta: "Upload a Parcha",
  },
];

const ADVANCE_MS = 6000;

export function BannerCarousel() {
  const rail = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  /* Set once and never cleared: see the note above about resuming. */
  const [taken, setTaken] = useState(false);

  /**
   * How far one slide is from the next.
   *
   * Measured rather than assumed to be the container width: the slides
   * are inset by the page gutter and separated by a gap, so a step of
   * `clientWidth` drifts by 60px a slide and the third dot lights over
   * the second banner. Reading it off the first child keeps the arithmetic
   * true to whatever the stylesheet says the gutter is.
   */
  const step = useCallback(() => {
    const el = rail.current;
    if (!el) return 0;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return el.clientWidth;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    return first.offsetWidth + gap;
  }, []);

  const goTo = useCallback(
    (i: number, smooth = true) => {
      const el = rail.current;
      if (!el) return;
      el.scrollTo({ left: i * step(), behavior: smooth ? "smooth" : "auto" });
    },
    [step],
  );

  /* The scroll position is the source of truth for which dot is lit —
     including mid-swipe, where no click ever happened. */
  function onScroll() {
    const el = rail.current;
    const width = step();
    if (!el || width === 0) return;
    setIndex(Math.round(el.scrollLeft / width));
  }

  useEffect(() => {
    if (taken) return;
    /* Someone who has asked their device to stop animating things has
       asked for this too. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      /* A background tab still fires intervals, and advancing there
         means returning to a carousel that has silently moved on. */
      if (document.hidden) return;
      const el = rail.current;
      const width = step();
      if (!el || width === 0) return;
      const at = Math.round(el.scrollLeft / width);
      goTo((at + 1) % SLIDES.length);
    }, ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [taken, goTo, step]);

  return (
    <div className="relative">
      <div
        ref={rail}
        onScroll={onScroll}
        /* `touchstart` rather than `scroll`: the auto-advance scrolls too,
           and listening for scroll would have the carousel switch itself
           off on its own first tick. */
        onTouchStart={() => setTaken(true)}
        onPointerDown={() => setTaken(true)}
        /* `scroll-pl-5` is what keeps the snapped slide inside the page
           gutter: without it the snapport starts at the padding *box*, so
           the browser aligns slide one flush with the viewport edge and
           the 20px of padding shows up as scroll offset instead. The gap
           is the same 20px on purpose — it makes the next slide start
           exactly at the viewport's right edge, so nothing peeks. */
        className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 scroll-pl-5"
        aria-roledescription="carousel"
        aria-label="Featured"
      >
        {SLIDES.map((slide, i) => (
          <Slide key={slide.id} slide={slide} position={i} priority={i === 0} />
        ))}
      </div>

      {/* Outside the rail so it does not scroll away with slide one. */}
      <Link
        href="/categories"
        className="absolute right-9 top-4 flex items-center gap-1 rounded-full bg-surface/95 px-3.5 py-2 text-caption font-medium text-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-surface"
      >
        Shop by Category
        <Chevron className="size-3.5 text-muted" />
      </Link>

      <div className="mt-3 flex justify-center gap-1.5">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => {
              setTaken(true);
              goTo(i);
            }}
            aria-label={`Go to slide ${i + 1} of ${SLIDES.length}`}
            aria-current={i === index ? "true" : undefined}
            /* The hit area is 24px even though the mark is 6px — a dot you
               have to aim at is a dot nobody uses. */
            className="grid h-6 w-6 place-items-center"
          >
            <span
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                i === index ? "w-5 bg-accent" : "w-1.5 bg-line-strong",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function Slide({
  slide,
  position,
  priority,
}: {
  slide: (typeof SLIDES)[number];
  position: number;
  priority: boolean;
}) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${position + 1} of ${SLIDES.length}`}
      /* `w-full` inside a `px-5` scroller: the slide is the width of the
         gutter-inset column, so the snap point lands with the card's own
         left edge against the gutter rather than against the viewport. */
      className="relative w-full shrink-0 snap-start overflow-hidden rounded-card bg-sunk"
    >
      {/* The photograph is the backdrop and the type is the sizer, not the
          other way round. With a fixed aspect ratio and absolutely placed
          text the box stops being tall enough somewhere around 340px, and
          the first line of the headline is simply cut off — a bug you only
          see on the narrowest phone in the range, which is the one nobody
          tests on. A minimum height plus in-flow type cannot clip: the
          banner grows instead. */}
      <div className="absolute inset-0">
        <Image
          src={slide.image}
          alt=""
          fill
          priority={priority}
          sizes="(min-width: 1024px) 960px, 100vw"
          className="object-cover"
        />
        {/* Two stops, not one. A single 50% black wash over the whole
            frame dulls the photograph everywhere to fix contrast in the
            left third; this leaves the right side almost untouched. */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/5" />
      </div>

      <div className="relative flex min-h-[14.5rem] max-w-[72%] flex-col justify-center p-5 sm:min-h-[17rem] sm:max-w-[52%] sm:p-8">
        {/* The display face, which is the whole reason it is in the app:
            Fraunces set in caps at 24px is the difference between a
            banner and a slide with words on it. */}
        <h2 className="font-display text-title-lg font-bold uppercase leading-[1.08] tracking-tight text-white sm:text-display-sm">
          {slide.lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h2>

        {/* The one handwritten line in the app. Set two steps up from the
            sans it sits under, because Caveat draws small on its em box —
            at a matched size it reads as a caption rather than a flourish. */}
        <p className="mt-1 font-script text-title-lg text-accent-bright sm:text-headline-lg">
          {slide.script}
        </p>

        <Link
          href={slide.href}
          /* `photo-cta`, not `deep`: this plate sits on a photograph, and
             the token that knows what a photograph looks like after dark
             is the one that has to pick the colour. */
          /* `whitespace-nowrap`: inside a 72% column at 320px the label
             breaks across two lines and the pill stops reading as one. */
          className="mt-4 inline-flex w-fit items-center gap-2 whitespace-nowrap rounded-full bg-photo-cta px-4 py-3 text-caption font-semibold text-on-photo-cta transition-opacity hover:opacity-90 sm:px-5 sm:text-body"
        >
          {slide.cta}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
