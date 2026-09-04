import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { withParams, type BrowseParams } from "@/lib/browse-params";

/**
 * One-tap filters, on a phone.
 *
 * The full panel is behind a button and always will be — fourteen brands
 * and a price range do not belong on a 390px screen by default. But the
 * three or four filters people actually reach for should not need a sheet
 * at all, and these are them: a price ceiling, the fast-delivery cut, and
 * the discount.
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
    label: "Under ₹1,000",
    params: { max: "1000" },
    activeWhen: (p) => p.max === "1000",
  },
  {
    label: "Under ₹5,000",
    params: { max: "5000" },
    activeWhen: (p) => p.max === "5000",
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
}: {
  basePath: string;
  params: BrowseParams;
  className?: string;
}) {
  return (
    <div className={cn("rail gap-2 px-5 scroll-pl-5 lg:hidden", className)}>
      {CHIPS.map((chip) => {
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
