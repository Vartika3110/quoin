import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Badge";
import { Photo } from "@/components/ui/Photo";
import { ArrowRight, Check, Clock, Pin } from "@/components/icons";
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
 * **The photograph is a room, not a building site.** Scaffolding and rebar
 * say "construction"; this business sells the finished thing, and the
 * first picture on the page is the one claim it makes about what a
 * customer ends up with. `photo` comes from Studio's best-saved room, so
 * the day real interiors are uploaded the home page improves without
 * anybody editing this file.
 *
 * The delivery promise is here rather than in the header because it is a
 * *claim*, and a claim belongs next to the proposition it qualifies. It
 * names the area and scopes itself to in-stock goods — three of Quoin's
 * four fulfilment types cannot honour eighteen minutes and the page must
 * never imply otherwise.
 */

/** Three, and each one is a fact this app can stand behind. Every claim
    here is checkable against something in the product: a brand roster, a
    per-item fulfilment type, and a payment page. */
const TICKS = [
  "Brands bought direct",
  "Delivery promised per item",
  "Serviced across West Delhi",
];

export function Hero({
  chosen,
  photo,
}: {
  chosen: AreaChoice | null;
  /** Studio's best-saved room. Null falls back to the catalogue's own
      bathroom photography — still a finished space, never the site. */
  photo: { url: string; blurDataUrl: string | null } | null;
}) {
  return (
    <section className="grid overflow-hidden rounded-2xl border border-line-soft lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      {/* Solid, not a wash over the photograph: every word on this panel
          is read, and read type belongs on a flat ground. */}
      <div className="flex flex-col justify-center bg-raised px-5 py-8 sm:py-16 lg:px-12 lg:py-20">
        <Eyebrow>Build better. Buy smarter.</Eyebrow>

        <h1 className="mt-3 font-display text-title-lg font-semibold text-ink sm:mt-4 sm:text-display-sm lg:text-display-sm xl:text-display">
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

        <ul className="mt-6 flex flex-col gap-1.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-x-5">
          {TICKS.map((tick) => (
            <li key={tick} className="flex items-center gap-1.5 text-caption text-muted">
              <Check className="size-3.5 shrink-0 text-accent" />
              {tick}
            </li>
          ))}
        </ul>

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

      {/* Hard-cropped, and taller than it is wide on a phone so the
          stacked order — picture, then words — still shows a room rather
          than a letterbox strip of one. */}
      <Photo
        src={photo?.url ?? FALLBACK.url}
        alt=""
        ratio="4 / 3"
        blurDataURL={photo?.blurDataUrl ?? null}
        sizes="(min-width: 1024px) 45vw, 100vw"
        priority
        className="order-first h-full min-h-56 w-full lg:order-none lg:aspect-auto"
      />
    </section>
  );
}

/**
 * Where the hero's picture comes from when Studio has none.
 *
 * The catalogue's own commissioned bathroom photography: a finished
 * space, shot for this business, and the closest thing in the repo to the
 * interior this hero is supposed to show. It is a stand-in and it is
 * meant to be replaced — the moment one real room is uploaded and saved,
 * `photo` wins and this is never rendered again.
 */
const FALLBACK = { url: "/categories/bathware-plumbing.webp" };
