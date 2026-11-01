import Link from "next/link";
import { CheckCircle, Chevron } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { formatPrice } from "@/lib/types/catalog";
import {
  initialsOf,
  PROFESSIONALS_ARE_SAMPLE,
  type Professional,
} from "@/lib/data/professionals";

/**
 * The roster, as the reference design draws it.
 *
 * Avatar and verified mark, name over trade, then the three numbers a
 * customer compares on — rating, jobs done, how fast they answer — and a
 * fee with a Book button.
 *
 * ## The banner is not decoration
 *
 * `PROFESSIONALS_ARE_SAMPLE` is true and every row below is invented.
 * The banner above the rail says so, and it goes away on its own the
 * moment `src/lib/data/professionals.ts` holds a real roster — it is the
 * same arrangement `SiteFooter` uses for a GSTIN nobody has verified,
 * and for the same reason: a placeholder nobody flagged is
 * indistinguishable from a claim.
 *
 * Shipping the ratings unlabelled would spend the credibility of the
 * 2,513 real prices in the catalogue to decorate a section that books
 * nothing. Labelled, the layout can be reviewed and signed off without
 * costing anything.
 *
 * ## Book goes somewhere real
 *
 * `/services/book?service=<slug>` is the actual booking form, so the
 * button is not a prop even while the person on the card is. A booking
 * made here starts the same `QUOTE_PENDING` conversation every other
 * entry point starts; nothing about this row takes a payment or
 * allocates anybody.
 */
export function ProfessionalRail({
  people,
  layout = "rail",
}: {
  people: Professional[];
  /**
   * `rail` scrolls sideways — right for the home page, where the roster
   * is a taste of something with its own page. `list` stacks, for that
   * page: a reader who has arrived at Services is choosing from the whole
   * roster, and a list you scroll past is read, where a rail you swipe
   * through is sampled.
   */
  layout?: "rail" | "list";
}) {
  return (
    <div>
      {PROFESSIONALS_ARE_SAMPLE ? (
        /* Loud on purpose, and only while the roster is invented —
           deleting this line is `PROFESSIONALS_ARE_SAMPLE = false`, which
           is the same edit that makes it untrue. */
        <p className="mx-5 mb-2.5 text-micro font-semibold leading-relaxed text-accent lg:mx-0">
          Sample professionals — the names and trades below are
          placeholders. Replace them in src/lib/data/professionals.ts
          before launch.
        </p>
      ) : null}

      <div
        className={cn(
          layout === "list"
            ? "grid grid-cols-1 gap-3 px-5 sm:grid-cols-2 lg:grid-cols-3 lg:px-0"
            : /* `.rail` children refuse to shrink, so the card carries its
                 own width there and the grid takes it back above `lg`. */
              "rail gap-3 px-5 pb-1 scroll-pl-5 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-4",
        )}
      >
        {people.map((person) => (
          /* The whole card is the link, and there is no Book button.

             The button was struck off the design at the owner's
             instruction, which left a card listing a tradesperson with
             no way to reach them — so the action moved outwards rather
             than away. A card that is one target is also the easier one
             to hit on a phone: 190px of card beats a 64px pill at the
             bottom of it.

             `aria-label` because the link's own text would otherwise
             read "Prem Chand Electrician Quoted after the visit", which
             says everything except what pressing it does. */
          <Link
            key={person.id}
            href={`/services/book?service=${person.serviceSlug}`}
            aria-label={`Book ${person.name}, ${person.trade}`}
            className={cn(
              "group flex flex-col gap-3 rounded-card border border-line-soft bg-surface p-3 transition-colors hover:border-accent-edge hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:p-4",
              /* A fixed width only in the rail, where nothing else sets
                 one. In the list the grid column is the width. */
              /* 190px in the rail, from the design reference: at `w-72`
                 one card and a sliver filled a 375px screen, which reads
                 as a page that has run out rather than a row to swipe.
                 Two and a peek is what the reference shows. The grid
                 from `lg` still takes the width back. */
              layout === "list" ? "w-auto" : "w-[190px] shrink-0 lg:w-auto",
            )}
          >
            <div className="flex items-center gap-3">
              {/* Initials rather than a photograph: there are no
                  photographs, and a stock portrait of someone who is not
                  the tradesperson is a worse lie than two letters. */}
              <span className="relative shrink-0">
                <span className="grid size-12 place-items-center rounded-2xl bg-accent-wash font-display text-title-sm font-semibold text-accent">
                  {initialsOf(person.name)}
                </span>
                <CheckCircle className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-surface text-success" />
              </span>

              {/* `min-w-0` so long names truncate inside the card rather
                  than stretching it past the rail's own width. */}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-title-sm font-semibold leading-snug text-ink">
                  {person.name}
                </span>
                <span className="block truncate text-body-sm text-muted">
                  {person.trade}
                </span>
              </span>
            </div>

            {/* The meta row is gone, at the owner's instruction.

                It carried where someone works and when — "Paschim Vihar
                (National Market)", "All days, mornings" — on the
                argument that with no rating, job count or response time
                in the data, those two are what a customer picking a
                tradesperson decides on. The card is the name, the trade
                and how the fee is arrived at now.

                `rating`, `jobsCompleted` and `responseMinutes` had
                renderings here too and never had data behind them; they
                are off the card with the rest. Nothing invented a value
                then and nothing does now, which was the point worth
                keeping. */}
            {/* The fee, and a chevron where the button used to be. No
                longer a control — the card is the control — so this is
                `aria-hidden`: a mark that says the card goes somewhere,
                the way the cart bar's does. `nowrap` on the fee because
                the row no longer has a button to wrap around. */}
            <div className="mt-auto flex items-center justify-between gap-x-3 pt-0.5">
              {/* No invented fee. Where the owner has not set one the card
                  says how the fee is arrived at, which is how this trade
                  actually works — see `pricing` on each service. */}
              <span className="nums min-w-0 truncate text-title-sm font-semibold text-ink">
                {person.visitFeePaise != null
                  ? formatPrice(person.visitFeePaise)
                  : <span className="text-caption font-normal text-muted">Quoted after the visit</span>}
              </span>
              <Chevron
                aria-hidden
                className="size-4 shrink-0 text-faint transition-colors group-hover:text-accent"
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
