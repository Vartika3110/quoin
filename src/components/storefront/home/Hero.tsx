import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Chevron } from "@/components/icons";
import { TrustRow } from "@/components/storefront/Trust";
import { HeroCarousel } from "@/components/storefront/home/HeroCarousel";

/**
 * The first screen.
 *
 * Three slides behind a snap-scrolling track, built to the design
 * reference at the owner's instruction. The words sit over the
 * left-hand side of each picture behind a wash that fades out across
 * the frame.
 *
 * **This adds the carousel the reference has always drawn, and that is
 * a reversal worth recording** rather than quietly performing. The
 * single fixed photograph was chosen over a carousel three times, most
 * recently when this hero was last rebuilt, on the reasoning that the
 * home page's main image must not change on its own. That reasoning was
 * aimed at a *data-driven* hero — one that swapped itself for Studio's
 * best-saved room whenever somebody uploaded an interior, which is a
 * surprise nobody asked for and nobody would think to look for.
 *
 * These three slides are authored here, in this file, and change when
 * somebody edits this line. Nothing in the database can reach them.
 * `HERO_SLIDES[0]` is still the construction photograph, still first,
 * still what a reader sees before they touch anything — the carousel
 * adds two destinations behind it rather than taking it away.
 *
 * The other decisions this hero reversed earlier still hold: round
 * corners, words on the photograph at every width, and a row of claims
 * underneath that are this site's four and not the reference's. See
 * `TRUST` in `src/components/storefront/Trust.tsx` for why *Fast
 * Delivery* is not among them.
 */

interface HeroSlide {
  /** The picture, and whether it is one. See `visualisation`. */
  image: string;
  /** Broken by hand: the line break is content, not styling. */
  headline: [string, string];
  /** The italic line under it. Six words at most; it is a note, not a
      paragraph. */
  standfirst: string;
  cta: { label: string; href: string };
  /**
   * True when the picture is a render rather than a photograph.
   *
   * Studio's rooms are generated, and every other surface in this app
   * that shows one says so — the product card carries "Illustration ·
   * actual product may vary", the Studio pin carries its own tag. A
   * hero slide reading "designed and built" over an unlabelled render
   * is the same claim in the place it would be believed hardest, so the
   * tag the reference draws in the corner of its own hero does real
   * work here and is not decoration.
   */
  visualisation?: boolean;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    /* Quoin's own construction photograph, of a real building. It has
       been defended three times and stays first; see the note above. */
    image: "/hero/under-construction.webp",
    headline: ["Build your", "dream space"],
    standfirst: "One Platform. Every Need.",
    cta: { label: "Explore Studio", href: "/studio" },
  },
  {
    /* The service the reference calls Design & Renovate, which has its
       own section further down this page. The slide is the trailer; the
       section is the thing. */
    image: "/studio/double-height-evening-living.webp",
    headline: ["Your whole home,", "designed and built"],
    standfirst: "Plan, materials and crew.",
    cta: { label: "Book a design consult", href: "/consult" },
    visualisation: true,
  },
  {
    /* The catalogue, said as the reference says it. "Reimagine" is the
       only one of the three verbs this slide has to earn, and 61 brands
       and five hundred lines earn it. */
    image: "/studio/two-tone-walnut-graphite-kitchen.webp",
    headline: ["Repair. Renovate.", "Reimagine."],
    standfirst: "Every material, one order.",
    cta: { label: "Explore top brands", href: "/products" },
    visualisation: true,
  },
];

export function Hero() {
  return (
    /* The claims row is rendered here rather than by the page so it sits
       directly under the card. As a sibling in `PageSections` it picked
       up the full between-sections gap and floated in the middle of
       nowhere; it is part of the opening, not the section after it.

       A `div` and not a fragment, which is the same bug one layer up: a
       fragment has no DOM node, so `PageSections`' `space-y` would still
       see the card and the row as two of its own children and push them
       apart. One element makes them one section.

       `mx-5` to `lg` and nothing after it, which looks arbitrary and is
       not. The page's own wrapper is `max-w-shell lg:px-6`: it insets
       the column from `lg` and gives a phone no horizontal padding at
       all, because every section below reaches the edge itself and then
       insets its own contents by `px-5`. The hero had no such inset, so
       it alone ran edge to edge while everything under it sat 20px in.
       This matches it to them rather than introducing a new measure. */
    <div className="mx-5 lg:mx-0">
      {/* The rounded card is the carousel's frame, not each slide's, so
          the corners stay put while the slides move inside them. */}
      <div className="overflow-hidden rounded-card border border-line-soft">
        <HeroCarousel label="Quoin">
          {HERO_SLIDES.map((slide, i) => (
            <Slide key={slide.image} slide={slide} first={i === 0} />
          ))}
        </HeroCarousel>
      </div>

      <TrustRow />
    </div>
  );
}

function Slide({ slide, first }: { slide: HeroSlide; first: boolean }) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Behind everything, at every width. The text block below sets
          the card's height and this stretches to whatever that turns out
          to be, rather than the other way round.

          `next/image` directly rather than this app's `Photo`: that one
          reserves a box with an `aspect-ratio`, which is exactly what a
          fill background must not do, and it carries a `useState` error
          fallback that would make the whole hero a client component. The
          fallback buys nothing here — these are fixed assets committed
          to the repo, not catalogue photographs that may be missing.

          Only the first slide is `priority`. Preloading all three would
          put two large images in front of the one the reader is
          actually looking at, on a connection that has not yet drawn
          the page. */}
      <Image
        src={slide.image}
        alt=""
        fill
        sizes="100vw"
        priority={first}
        loading={first ? undefined : "lazy"}
        className="-z-10 object-cover"
      />

      {/* The wash.
          Horizontal, and it is what makes the composition work: the type
          needs an opaque-enough ground on the left, and the photograph
          needs to be visibly a photograph on the right. A flat scrim
          over the whole frame would give the first and lose the second.

          Built from `bg`, the page's own ground, so it is cream in the
          light theme and near-black in the dark one and `text-ink` reads
          on both without a second set of colours. The stops are steeper
          below `lg`: at 375px the text occupies most of the width, so
          the wash has to carry further across before it clears. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-bg via-bg/80 to-bg/25 lg:from-bg lg:via-bg/65 lg:to-transparent"
      />

      {/* Top-right, over the part of the frame the wash has cleared.
          A link rather than a `Button`: it is a quiet secondary route
          into the catalogue sitting on a photograph, and every Button
          variant here would either fight the headline's pill or vanish
          into the picture. */}
      <Link
        href="/categories"
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-surface px-3.5 py-2 text-micro font-semibold text-ink shadow-sm transition-colors hover:bg-hover lg:right-6 lg:top-6 lg:text-caption"
      >
        Shop by Category
        <Chevron className="size-3.5" />
      </Link>

      {/* Bottom-right, clear of the dots, on the slides that need it.
          Small and quiet: it is a disclosure, not a label the design is
          built around. */}
      {slide.visualisation && (
        <span className="absolute bottom-3 right-4 z-10 rounded-full bg-ink/70 px-2.5 py-1 text-micro font-medium text-bg lg:bottom-5 lg:right-6">
          Visualisation
        </span>
      )}

      {/* `lg:max-w-xl` rather than `lg:max-w-lg`, which was wide enough
          for the one headline this hero used to carry. "Your whole
          home, designed and built" broke to four lines inside the
          narrower column and read as a paragraph in display type. */}
      <div className="relative max-w-[18rem] px-5 pb-12 pt-16 sm:max-w-sm sm:pt-20 lg:max-w-xl lg:px-12 lg:pb-20 lg:pt-24">
        {/* Uppercase and broken by hand. The line break is content, not
            styling — "BUILD YOUR / DREAM SPACE" is two balanced lines and
            letting it wrap on its own gives "BUILD YOUR DREAM / SPACE" at
            most widths. `text-balance` cannot help: it balances what it
            is given, and what looks right here is a specific break. */}
        <h1 className="font-display text-title-lg font-bold uppercase leading-[1.05] text-ink sm:text-display-sm lg:text-display">
          {slide.headline[0]}
          <br />
          {slide.headline[1]}
        </h1>

        {/* The reference sets this in a script face. There is no script
            family loaded — the app ships two, a sans for everything read
            and a serif for everything scanned — and pulling a third from
            Google for one line of six words is a font request on every
            first paint for a flourish. The serif's italic carries the
            same editorial note at no cost. */}
        <p className="mt-2 font-display text-title-sm italic text-accent sm:text-title lg:mt-3 lg:text-title-lg">
          {slide.standfirst}
        </p>

        {/* A styled link rather than a `Button`.

            The reference draws a near-black pill, which is `Button`'s
            `secondary` variant — and that variant is a *fixed* dark in
            both themes, so on this page's dark ground it was a black
            pill on a black card and all but disappeared. Overriding it
            through `className` does not work either: `cn` here is not
            `tailwind-merge`, so the variant's own background wins on
            stylesheet order (the same trap `StickyBar` documents).

            `bg-ink text-bg` inverts with the theme instead: near-black
            on cream in the light theme, exactly as drawn, and cream on
            near-black in the dark one. Maximum contrast against the
            page either way, which is what the reference's pill is
            actually doing. */}
        <Link
          href={slide.cta.href}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 lg:mt-7 lg:text-body"
        >
          {slide.cta.label}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
