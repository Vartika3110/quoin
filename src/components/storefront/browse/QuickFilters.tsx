import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { withParams, type BrowseParams } from "@/lib/browse-params";

/**
 * One-tap filters, on a phone.
 *
 * The full panel is behind a button and always will be — fourteen brands
 * and a price range do not belong on a 390px screen by default. But the
 * filters people actually reach for should not need a sheet at all, and
 * these are them: the fast-delivery cut, the discount, and the newest
 * arrivals.
 *
 * Price used to have two of its own chips here — "Under ₹1,000" and
 * "Under ₹5,000" — before the design prototype's chip row added a "Price"
 * chip with its own sheet of bands just above this one. Keeping both
 * would mean two different price systems stacked on top of each other on
 * a 375px screen: one exact ceiling here, four ranges a sheet away, and
 * no way to tell from either which one is winning. They are folded into
 * that one sheet instead — see `PRICE_BUCKETS` in `browse-params.ts` —
 * rather than kept as a second, narrower way to do the same thing.
 *
 * Every chip is a link with a real parameter behind it, and every one
 * toggles: tapping the active chip clears it. Chips that look like filters
 * but only sort, or that set something the panel cannot then unset, are
 * the usual way this pattern goes wrong.
 *
 * Nothing here claims to be "popular" or "top rated". There is no ranking
 * data and no review data, so those two chips would be sorting by nothing.
 */
const CHIPS: {
  label: string;
  params: Partial<BrowseParams>;
  /** Which of `params` decides whether the chip reads as on. */
  activeWhen: (p: BrowseParams) => boolean;
}[] = [
  {
    label: "In 18 minutes",
    params: { fulfilment: "instant" },
    activeWhen: (p) => p.fulfilment === "instant",
  },
  {
    label: "Under list price",
    params: { offers: "1" },
    activeWhen: (p) => p.offers === "1",
  },
  {
    label: "Newest",
    params: { sort: "newest" },
    activeWhen: (p) => p.sort === "newest",
  },
];

export function QuickFilters({
  basePath,
  params,
  className,
  /** `true` on Deals, where every result is already under list price, so
      the chip would toggle a parameter that changes nothing on screen. */
  hideOffers = false,
}: {
  basePath: string;
  params: BrowseParams;
  className?: string;
  hideOffers?: boolean;
}) {
  const chips = hideOffers
    ? CHIPS.filter((chip) => !("offers" in chip.params))
    : CHIPS;

  return (
    <div className={cn("rail gap-2 px-5 scroll-pl-5 lg:hidden", className)}>
      {chips.map((chip) => {
        const on = chip.activeWhen(params);
        /* Toggling off means clearing exactly the keys this chip sets —
           not resetting everything, which would drop a brand the customer
           chose in the sheet a moment ago. */
        const cleared = Object.fromEntries(
          Object.keys(chip.params).map((key) => [key, undefined]),
        ) as Partial<BrowseParams>;

        return (
          <Link
            key={chip.label}
            href={withParams(basePath, params, on ? cleared : chip.params)}
            aria-pressed={on}
            className={cn(
              "flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-caption font-medium transition-colors",
              on
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-surface text-muted",
            )}
          >
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}
