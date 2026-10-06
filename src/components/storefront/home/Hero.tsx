import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Badge";
import { Photo } from "@/components/ui/Photo";
import { ArrowRight, Clock, Pin } from "@/components/icons";
import type { AreaChoice } from "@/lib/data/service-areas";

/**
 * The first screen.
 *
 * Two columns inside one card: a solid cream panel carrying every word,
 * and a photograph hard-cropped beside it.
 *
 * The previous hero faded the photograph into the band with a mask and a
 * scrim, on the argument that a cropped panel "draws a seam down the
 * middle". It does draw a line, and the line is the point — it is the
 * edge of a card, which is the vocabulary every other block on this page
 * is built from. What the fade actually produced was a photograph
 * dissolving into nothing, which reads as an image that failed to load,
 * and it needed a second gradient on top to survive the dark palette.
 * Two gradients to hide an edge is more machinery than the edge costs.
 *
 * **The photograph is Quoin's own construction shot**, restored at the
 * owner's instruction and now fixed — see `HERO_PHOTO` at the foot of
 * this file.
 *
 * The panel carries the proposition and two buttons, and stops there. It
 * also held a tick list — "Brands bought direct", "Delivery promised per
 * item" — and a line naming the four live localities. Both are gone at
 * the owner's instruction. They were true, and being true is not the
 * same as being worth the first screen: a visitor who has not yet read
 * what Quoin sells has no use for its sourcing policy, and the ticks
 * were the third qualifier under a sentence that needed none.
 *
 * What survives is the ETA, and only once a visitor has chosen an area —
 * "18 minutes" with no locality attached is a slogan. It scopes itself
 * to in-stock goods because three of Quoin's four fulfilment types
 * cannot honour it and the page must never imply otherwise.
 */

export function Hero({ chosen }: { chosen: AreaChoice | null }) {
  return (
    <section className="grid overflow-hidden rounded-2xl border border-line-soft lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      {/* Over the photograph on a phone, beside it from `lg`.

          Stacked, the picture took the whole first screen and pushed the
          sentence saying what Quoin is below the fold — so the opening
          view was a building with no caption. Laid over it, the two
          arrive together.

          `col-start-1 row-start-1` puts the panel and the photograph in
          the same grid cell instead of two; from `lg` the explicit
          columns take over and they sit side by side again, which is
          where there is room for both. */}
      <div className="relative z-10 col-start-1 row-start-1 flex flex-col justify-end px-5 pb-8 pt-28 text-on-deep sm:pt-40 lg:col-start-auto lg:row-start-auto lg:justify-center lg:bg-raised lg:px-12 lg:py-20 lg:text-ink">
        {/* The photograph is a bright sky at the top and pale concrete
            below, so white type needs something under it. A gradient
            rather than a flat wash: the building stays readable at the
            top of the frame and the words get their contrast where they
            actually sit. Gone from `lg`, where the panel has its own
            opaque ground. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/70 to-deep/25 lg:hidden"
        />

        {/* The eyebrow is accent-coloured, which is a brown on a
            photograph of concrete at golden hour — it disappeared. Light
            below `lg`, its own colour from `lg` where the panel is
            opaque again. */}
        <span className="relative [&_*]:!text-on-deep lg:[&_*]:!text-accent">
          <Eyebrow>Build better. Buy smarter.</Eyebrow>
        </span>

        <h1 className="relative mt-3 font-display text-title-lg font-semibold sm:mt-4 sm:text-display-sm lg:text-display-sm xl:text-display">
          Everything you need to build, renovate and reimagine your space.
        </h1>

        <p className="relative mt-3 max-w-md text-body leading-relaxed text-on-deep/80 sm:mt-5 sm:text-body-lg lg:text-muted">
          Materials, products, expert services and project tools — brought
          together in one intelligent platform.
        </p>

        {/* Side by side on a phone rather than stacked: two full-width
            buttons is 120px of the first screen spent on two taps. */}
        <div className="relative mt-6 flex items-center gap-2 sm:mt-8 sm:gap-3">
          <Button
            href="/products"
            size="lg"
            className="flex-1 whitespace-nowrap px-4 sm:flex-none sm:px-6"
          >
            Explore products
            {/* Dropped on a phone: at `flex-1` the arrow is what tips the
                label onto a second line. */}
            <ArrowRight className="hidden size-4 sm:block" />
          </Button>
          <Button
            href="/projects/new"
            size="lg"
            variant="outline"
            className="flex-1 whitespace-nowrap px-4 sm:flex-none sm:px-6"
          >
            Plan a project
          </Button>
        </div>

        {/* Rendered only once an area is chosen — "18 minutes" with no
            locality attached is a slogan, and this has to read as a fact
            about where the customer is. */}
        {chosen?.etaMinutes != null && (
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
            <span className="inline-flex items-center gap-1.5 text-ink">
              <Clock className="size-4 text-accent" />
              <span className="nums font-semibold">{chosen.etaMinutes} minutes</span>
            </span>
            <span>on in-stock items to</span>
            <span className="inline-flex items-center gap-1 text-ink">
              <Pin className="size-3.5 text-accent" />
              {chosen.name}
            </span>
          </p>
        )}
      </div>

      {/* Hard-cropped, and tall on a phone: the panel sits on top of it,
          so the frame has to be deep enough that the building is still
          legible either side of the words. */}
      <Photo
        src={HERO_PHOTO.url}
        alt=""
        ratio="4 / 3"
        blurDataURL={null}
        sizes="(min-width: 1024px) 45vw, 100vw"
        priority
        className="col-start-1 row-start-1 h-full min-h-[26rem] w-full sm:min-h-[32rem] lg:col-start-auto lg:row-start-auto lg:min-h-0 lg:aspect-auto"
      />
    </section>
  );
}

/**
 * The hero's picture: Quoin's own construction photograph.
 *
 * Fixed, and deliberately not sourced from anywhere else. Two earlier
 * revisions each took it away by a different route — one swapped it for
 * catalogue bathroom photography on the argument that the hero should
 * show the finished room a customer ends up with rather than the site it
 * came out of; the other left it as a fallback behind "Studio's
 * best-saved room", which quietly replaced it again the moment Studio
 * had any rooms at all.
 *
 * That second arrangement is the worse of the two, because the home
 * page's main image then changes on its own whenever somebody uploads an
 * interior — a surprise nobody asked for and nobody would think to look
 * for. The owner has asked for this photograph, twice. It is Quoin's
 * own, it is of a real building, and it says what the company is for, so
 * it is a constant and changing it is an edit to this line.
 */
const HERO_PHOTO = { url: "/hero/under-construction.webp" };
