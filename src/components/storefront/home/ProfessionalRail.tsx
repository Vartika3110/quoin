import { Bolt, CheckCircle, Clock, Pin, Star } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { formatPrice } from "@/lib/types/catalog";
import {
  initialsOf,
  jobsLabel,
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
          Sample professionals — the names, ratings, job counts and
          response times below are placeholders. Replace them in
          src/lib/data/professionals.ts before launch.
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
          <article
            key={person.id}
            className={cn(
              "flex flex-col gap-3 rounded-card border border-line-soft bg-surface p-4",
              /* A fixed width only in the rail, where nothing else sets
                 one. In the list the grid column is the width. */
              layout === "list" ? "w-auto" : "w-72 shrink-0 lg:w-auto",
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

            {/* Only what the roster actually carries. A rating needs a
                review table, a job count needs booking history and a
                response time needs measuring — none of the three exist,
                and inventing them beside a real person's name is a claim
                they never agreed to. Where they are absent the card says
                where someone works and when, which is what a customer
                picking a tradesperson is deciding on anyway. */}
            {/* Rendered only when there is something in it. An empty
                flex row still spends the card's gap, which left a hole
                under the name of everyone the sheet records no area or
                availability for. */}
            {(person.rating != null ||
              person.jobsCompleted != null ||
              person.responseMinutes != null ||
              person.area ||
              person.availability) && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {person.rating != null && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent-wash px-2 py-1 text-caption font-semibold text-ink">
                  <Star className="size-3.5 text-accent" />
                  <span className="nums">{person.rating.toFixed(1)}</span>
                </span>
              )}
              {person.jobsCompleted != null && (
                <span className="nums truncate text-caption text-muted">
                  {jobsLabel(person.jobsCompleted)}
                </span>
              )}
              {person.responseMinutes != null && (
                <span className="inline-flex shrink-0 items-center gap-1 text-caption text-success">
                  <Bolt className="size-3.5" />
                  <span className="nums">{person.responseMinutes} min</span>
                </span>
              )}
              {person.area && (
                <span className="inline-flex min-w-0 items-center gap-1 text-caption text-muted">
                  <Pin className="size-3.5 shrink-0 text-accent" />
                  <span className="truncate">{person.area}</span>
                </span>
              )}
              {person.availability && (
                <span className="inline-flex min-w-0 items-center gap-1 text-caption text-muted">
                  <Clock className="size-3.5 shrink-0 text-accent" />
                  <span className="truncate">{person.availability}</span>
                </span>
              )}
            </div>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 pt-0.5">
              {/* No invented fee. Where the owner has not set one the card
                  says how the fee is arrived at, which is how this trade
                  actually works — see `pricing` on each service. */}
              <span className="nums text-title-sm font-semibold text-ink">
                {person.visitFeePaise != null
                  ? formatPrice(person.visitFeePaise)
                  : <span className="text-caption font-normal text-muted">Quoted after the visit</span>}
              </span>
              <Button
                href={`/services/book?service=${person.serviceSlug}`}
                size="sm"
                className="px-5"
              >
                Book
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
