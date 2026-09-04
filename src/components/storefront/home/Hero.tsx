import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Badge";
import { ArrowRight, Clock, Pin } from "@/components/icons";
import type { AreaChoice } from "@/lib/data/service-areas";

/**
 * The first screen.
 *
 * One composition, not a grid of cards. The previous hero shared the band
 * with four entry tiles above it and a six-icon rail below, so the headline
 * — the only thing on the page that says what Quoin is — arrived third.
 *
 * Type occupies the left half at a fixed measure and the photograph fills
 * the right, masked rather than boxed: cropping it to a panel draws a seam
 * down the middle of the band, and the frame was shot into a pale sky that
 * is already close to the ground colour, so a gradient mask leaves no line
 * where one becomes the other.
 *
 * The delivery promise is in the hero rather than the header because it is
 * a *claim*, and a claim belongs next to the proposition it qualifies. It
 * names the area and scopes itself to in-stock goods — three of Quoin's
 * four fulfilment types cannot honour eighteen minutes and the page must
 * never imply otherwise.
 */
export function Hero({ chosen }: { chosen: AreaChoice | null }) {
  return (
    <section className="relative overflow-hidden bg-sunk lg:rounded-2xl">
      {/* The photograph. Decorative, so no alt text — the headline beside
          it carries the meaning.

          Blended into the band two ways, and it needs both. The **mask**
          fades the image's own left edge to nothing, which is what stops
          it reading as a rectangle cropped into a panel. The **scrim** on
          top is a gradient in the band's own ground colour, and exists
          because the mask alone is only enough when the ground and the
          picture are a similar brightness — true of the light palette,
          where this frame's pale sky is within a few percent of the paper,
          and emphatically not true after dark, where a half-faded sky over
          a near-black band still reads as a hard seam. */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] sm:block"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, #000 55%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 55%)",
        }}
      >
        <Image
          src="/hero/under-construction.webp"
          alt=""
          fill
          /* The largest element above the fold. Left to lazy-load it
             becomes the Largest Contentful Paint and is then delayed on
             purpose. */
          priority
          sizes="(min-width: 1024px) 900px, 62vw"
          className="object-cover object-right"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-sunk from-15% via-sunk/45 via-55% to-transparent" />
      </div>

      {/* Compact on a phone, editorial from `sm` up.

          At 390px the desktop hero is a full screen of type before the
          first category — which is exactly the "responsive desktop site"
          failure this layout exists to avoid. The headline drops two steps
          on the scale, the padding halves, and the two calls to action sit
          side by side, so the catalogue starts within the first scroll. */}
      <div className="relative px-5 py-8 sm:py-16 lg:px-12 lg:py-24">
        <div className="max-w-xl">
          <Eyebrow>Build better. Buy smarter.</Eyebrow>

          <h1 className="mt-3 text-title-lg font-semibold text-ink sm:mt-4 sm:text-display-sm lg:text-display">
            Everything you need to build, renovate and reimagine your space.
          </h1>

          <p className="mt-3 max-w-md text-body leading-relaxed text-muted sm:mt-5 sm:text-body-lg">
            Materials, products, expert services and project tools — brought
            together in one intelligent platform.
          </p>

          {/* Side by side on a phone rather than stacked: two full-width
              buttons is 120px of the first screen spent on two taps. */}
          <div className="mt-6 flex items-center gap-2 sm:mt-8 sm:gap-3">
            <Button
              href="/products"
              size="lg"
              className="flex-1 whitespace-nowrap px-4 sm:flex-none sm:px-6"
            >
              Explore products
              {/* Dropped on a phone: at `flex-1` the arrow is what tips
                  the label onto a second line. */}
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

          {/* The promise, scoped. Rendered only once an area is chosen —
              "18 minutes" with no locality attached is a slogan, and this
              has to read as a fact about where the customer is. */}
          {chosen?.etaMinutes != null && (
            <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted sm:mt-8">
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
      </div>
    </section>
  );
}
