import Link from "next/link";
import { Check, Percent } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { formatPrice, type FulfilmentType } from "@/lib/types/catalog";
import type { ProductFacets } from "@/lib/data/catalog";
import {
  FULFILMENT_LABEL,
  activeFilterCount,
  toggleParam,
  withParams,
  type BrowseParams,
} from "@/lib/browse-params";

/**
 * The filter panel.
 *
 * Built from links and one small GET form, not from client state. Every
 * option is an anchor to the same page with one parameter changed, so
 * filtering works with JavaScript off, the result is shareable, and the
 * back button walks back through the filters that were applied. The only
 * thing that cannot be a link is the price range, because it takes typed
 * input — that is a `<form method="get">`, which is equally JS-free.
 *
 * The same markup serves the desktop sidebar and the mobile drawer. The
 * drawer wraps it rather than reimplementing it, so the two can never
 * offer different filters.
 *
 * Every count is the count you would get **if you picked that option**,
 * with the option's own dimension removed from the query. A count that
 * already includes the filter it sits next to is either the result total
 * or zero, and both are useless.
 */
export function FilterPanel({
  basePath,
  params,
  facets,
  /** Cap the brand list; the drawer can afford more rows than a sidebar. */
  brandLimit = 12,
}: {
  basePath: string;
  params: BrowseParams;
  facets: ProductFacets;
  brandLimit?: number;
}) {
  const active = activeFilterCount(params);

  return (
    <div className="space-y-6">
      {active > 0 && (
        <Link
          href={withParams(basePath, params, {
            brand: undefined,
            fulfilment: undefined,
            min: undefined,
            max: undefined,
            offers: undefined,
          })}
          className="flex items-center justify-between rounded-lg border border-line-soft bg-raised px-3 py-2.5 text-caption text-muted transition-colors hover:border-accent-edge hover:text-accent"
        >
          Clear {active} {active === 1 ? "filter" : "filters"}
        </Link>
      )}

      <Group title="Offers">
        <OptionLink
          href={toggleParam(basePath, params, "offers", "1")}
          selected={params.offers === "1"}
          count={facets.discountedCount}
          icon={<Percent className="size-3.5" />}
        >
          Under list price
        </OptionLink>
      </Group>

      <Group title="Delivery">
        {facets.fulfilments.map((f) => (
          <OptionLink
            key={f.id}
            href={toggleParam(basePath, params, "fulfilment", f.id)}
            selected={params.fulfilment === f.id}
            count={f.count}
          >
            {FULFILMENT_LABEL[f.id as FulfilmentType]}
          </OptionLink>
        ))}
      </Group>

      <Group
        title="Price"
        hint={
          facets.priceMaxPaise > 0
            ? `${formatPrice(facets.priceMinPaise)} – ${formatPrice(facets.priceMaxPaise)}`
            : undefined
        }
      >
        <PriceForm basePath={basePath} params={params} />
      </Group>

      {facets.brands.length > 0 && (
        <Group title="Brand">
          {facets.brands.slice(0, brandLimit).map((brand) => (
            <OptionLink
              key={brand.slug}
              href={toggleParam(basePath, params, "brand", brand.slug)}
              selected={params.brand === brand.slug}
              count={brand.count}
            >
              {brand.name}
            </OptionLink>
          ))}
          {facets.brands.length > brandLimit && (
            <p className="px-2 pt-1 text-micro text-faint">
              {facets.brands.length - brandLimit} more brands — narrow the
              category to see them.
            </p>
          )}
        </Group>
      )}
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-baseline justify-between gap-2 px-2 text-micro font-semibold uppercase tracking-wide text-ink">
        {title}
        {hint && <span className="nums font-normal normal-case text-faint">{hint}</span>}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

/**
 * One filter option.
 *
 * A link, styled as a checkbox row. `aria-current` rather than
 * `aria-checked`: this is navigation to a filtered view, and announcing a
 * link as a checkbox tells a screen-reader user to expect a control that
 * toggles in place.
 */
function OptionLink({
  href,
  selected,
  count,
  icon,
  children,
}: {
  href: string;
  selected: boolean;
  count: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-body transition-colors",
        selected ? "text-accent" : "text-ink hover:bg-hover",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-xs border transition-colors",
          selected
            ? "border-accent bg-accent text-on-accent"
            : "border-line-strong bg-surface text-transparent",
        )}
      >
        {icon ?? <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="nums shrink-0 text-micro text-faint">{count}</span>
    </Link>
  );
}

/**
 * The price range.
 *
 * A GET form, so submitting navigates with the values in the query string
 * and nothing has to run in the browser. The other active filters ride
 * along as hidden inputs — without them, setting a price would silently
 * clear the brand the customer had already chosen.
 */
function PriceForm({
  basePath,
  params,
}: {
  basePath: string;
  params: BrowseParams;
}) {
  const carried = (["q", "brand", "fulfilment", "offers", "sort", "view"] as const).filter(
    (key) => params[key],
  );

  return (
    <form action={basePath} method="get" className="px-2 pt-1">
      {carried.map((key) => (
        <input key={key} type="hidden" name={key} value={params[key]} />
      ))}

      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Minimum price in rupees</span>
          <input
            type="number"
            name="min"
            inputMode="numeric"
            min={0}
            defaultValue={params.min ?? ""}
            placeholder="Min ₹"
            className="nums h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-body text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
          />
        </label>
        <span className="text-faint" aria-hidden>
          –
        </span>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Maximum price in rupees</span>
          <input
            type="number"
            name="max"
            inputMode="numeric"
            min={0}
            defaultValue={params.max ?? ""}
            placeholder="Max ₹"
            className="nums h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-body text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
          />
        </label>
      </div>

      <button
        type="submit"
        className="mt-2 h-9 w-full rounded-lg border border-line bg-surface text-caption font-medium text-ink transition-colors hover:border-accent hover:bg-accent-wash hover:text-accent"
      >
        Apply price
      </button>
    </form>
  );
}
