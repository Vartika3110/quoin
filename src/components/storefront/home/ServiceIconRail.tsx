import Link from "next/link";
import { SERVICE_ICON } from "@/components/storefront/ServiceCard";
import type { Service } from "@/lib/data/services";

/**
 * The trades, as a row of marks.
 *
 * Picking a service is a different act from reading about one. Somebody
 * who already knows they need an electrician wants the word
 * "Electrical" and a way to tap it; the cards below answer the slower
 * question — what the fee is based on, how long the job runs — and
 * answering that for ten trades in card form is ten paragraphs before
 * the reader reaches the one they came for.
 *
 * So both: this row to choose from, the cards beneath to read. The row
 * is every service, because its whole value is that the reader finds
 * theirs in it; the cards stay a selection.
 *
 * ## What this row deliberately does not carry
 *
 * The design it is taken from puts a roster of named professionals under
 * this row — a photograph, a star rating, a job count, a response time
 * and a price each. None of those four exist as data. There is no vendor
 * table in this schema, nobody has been rated, and no roster behind the
 * app makes "15 min" true.
 *
 * `src/lib/data/services.ts` states the rule this follows: no
 * professionals, no reviews, no promised capacity. A page of invented
 * names with invented ratings is the single most damaging thing a
 * marketplace can ship, because it teaches the customer that the numbers
 * on this site are decorative — including the real prices in the
 * catalogue. The row below is the part of that design that is true.
 */
export function ServiceIconRail({ services }: { services: Service[] }) {
  return (
    /* A rail on a phone, an even row from `lg`. `.rail` children refuse
       to shrink, so each cell carries its own width there and `flex-1`
       takes it back above — ten trades divide the content width rather
       than scrolling on a screen with room for all of them. */
    <div className="rail gap-2.5 px-5 pb-1 scroll-pl-5 lg:gap-3 lg:overflow-visible lg:px-0 lg:scroll-pl-0">
      {services.map((service) => {
        const Icon = SERVICE_ICON[service.icon];

        return (
          <Link
            key={service.slug}
            href={`/services/${service.slug}`}
            className="group flex w-18 shrink-0 flex-col items-center gap-1.5 lg:w-auto lg:flex-1"
          >
            {/* `aspect-square` on a full-width span rather than a fixed
                size: the tile is then as wide as the column it is in at
                every breakpoint, and the label below sets its own width
                instead of being clipped by the mark's. */}
            <span className="grid aspect-square w-full place-items-center rounded-2xl border border-line-soft bg-accent-wash text-accent transition-transform duration-200 ease-out-quart group-active:scale-[0.96]">
              <Icon className="size-6 lg:size-7" />
            </span>
            <span className="text-center text-micro font-medium leading-tight text-ink">
              {service.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
