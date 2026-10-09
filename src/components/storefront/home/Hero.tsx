import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Chevron } from "@/components/icons";
import { TrustRow } from "@/components/storefront/Trust";

/**
 * The first screen.
 *
 * One image with the words laid over its left-hand side, behind a wash
 * that fades out across the frame — rebuilt to the design reference at
 * the owner's instruction, replacing the two-column arrangement of a
 * solid panel beside a hard-cropped photograph.
 *
 * Three of the decisions this reverses were themselves made at the
 * owner's instruction, and are reversed knowingly rather than
 * forgotten:
 *
 * **The corners are round again.** They were squared off because a
 * rounded card "read as one tile among the tiles below it". That is
 * still true of a tile-sized card; it is not true of this one, which is
 * the full width of the column and twice the height of anything under
 * it. The radius is the card radius every other surface uses, so it
 * reads as the page's opening image rather than as a foreign shape.
 *
 * **The words sit on the photograph at every width**, not only on a
 * phone. The old panel existed so the type had an opaque ground from
 * `lg`; the wash below does that job without taking half the frame, and
 * the reference's whole composition depends on the picture running the
 * full width behind the text.
 *
 * **There is a row of claims under it again.** A tick list was removed
 * from this page once for being "the third qualifier under a sentence
 * that needed none". The sentence is shorter now and the claims are no
 * longer stacked under it — they are a separate row beneath the card,
 * which is where the reference puts them. They are also the four lines
 * this site already uses, not the reference's: see `TRUST` in
 * `src/components/storefront/Trust.tsx` for why *Fast Delivery* is not
 * among them.
 *
 * What is **not** reversed is the photograph. The reference shows an
 * interior visualisation and a carousel of three; this stays the single
 * fixed construction shot, at the owner's instruction, confirmed again
 * when this hero was rebuilt. See `HERO_PHOTO` at the foot of the file.
 */

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
      <section className="relative isolate overflow-hidden rounded-card border border-line-soft">
        {/* Behind everything, at every width. The text block below sets
          the card's height and this stretches to whatever that turns out
          to be, rather than the other way round.

          `next/image` directly rather than this app's `Photo`: that one
          reserves a box with an `aspect-ratio`, which is exactly what a
          fill background must not do, and it carries a `useState` error
          fallback that would make the whole hero a client component. The
          fallback buys nothing here — this is a fixed asset committed to
          the repo, not a catalogue photograph that may be missing. */}
        <Image
          src={HERO_PHOTO.url}
          alt=""
          fill
          sizes="100vw"
          priority
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

        <div className="relative max-w-[18rem] px-5 pb-8 pt-16 sm:max-w-sm sm:pt-20 lg:max-w-lg lg:px-12 lg:pb-16 lg:pt-24">
          {/* Uppercase and broken by hand. The line break is content, not
            styling — "BUILD YOUR / DREAM SPACE" is two balanced lines and
            letting it wrap on its own gives "BUILD YOUR DREAM / SPACE" at
            most widths. `text-balance` cannot help: it balances what it
            is given, and what looks right here is a specific break. */}
          <h1 className="font-display text-title-lg font-bold uppercase leading-[1.05] text-ink sm:text-display-sm lg:text-display">
            Build your
            <br />
            dream space
          </h1>

          {/* The reference sets this in a script face. There is no script
            family loaded — the app ships two, a sans for everything read
            and a serif for everything scanned — and pulling a third from
            Google for one line of six words is a font request on every
            first paint for a flourish. The serif's italic carries the
            same editorial note at no cost. */}
          <p className="mt-2 font-display text-title-sm italic text-accent sm:text-title lg:mt-3 lg:text-title-lg">
            One Platform. Every Need.
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
            href="/studio"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 lg:mt-7 lg:text-body"
          >
            Explore Studio
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <TrustRow />
    </div>
  );
}

/**
 * The hero's picture: Quoin's own construction photograph.
 *
 * Fixed, and deliberately not sourced from anywhere else. Three
 * revisions have now each tried to take it away by a different route —
 * one swapped it for catalogue bathroom photography on the argument
 * that the hero should show the finished room a customer ends up with
 * rather than the site it came out of; one left it as a fallback behind
 * "Studio's best-saved room", which quietly replaced it again the moment
 * Studio had any rooms at all; and the design reference this hero is
 * built to draws an interior visualisation with a three-slide carousel
 * over it.
 *
 * The second and third are the worse ones, because the home page's main
 * image then changes on its own whenever somebody uploads an interior —
 * a surprise nobody asked for and nobody would think to look for. The
 * owner has asked for this photograph three times now, most recently
 * when choosing it over the reference's carousel. It is Quoin's own, it
 * is of a real building, and it says what the company is for, so it is a
 * constant and changing it is an edit to this line.
 */
const HERO_PHOTO = { url: "/hero/under-construction.webp" };
