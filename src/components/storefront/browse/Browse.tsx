import Link from "next/link";
import { InfiniteGrid } from "@/components/storefront/browse/InfiniteGrid";
import { FilterPanel } from "@/components/storefront/browse/FilterPanel";
import { DepartmentRail } from "@/components/storefront/browse/DepartmentRail";
import { TypeSidebar } from "@/components/storefront/browse/TypeSidebar";
import { CATEGORY_PHOTOS } from "@/lib/category-photos";
import { BrowseActionBar } from "@/components/storefront/browse/BrowseActionBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Grid, Menu, Search, Sort } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import type {
  ProductFacets,
  ProductPage,
  ProductSort,
} from "@/lib/data/catalog";
import {
  FULFILMENT_LABEL,
  SORTS,
  activeFilterCount,
  toFetchQuery,
  type BrowseScope,
  withParams,
  type BrowseParams,
} from "@/lib/browse-params";
import {
  PRICING_UNIT_LABEL,
  type FulfilmentType,
  type PricingUnit,
} from "@/lib/types/catalog";

/**
 * Product browsing.
 *
 * Sidebar and grid at `lg`, a filter sheet and a grid on a phone. Sort,
 * filters, the view toggle and the grid's "Show more" are all plain
 * links, so the whole page works without JavaScript and every state it
 * can be in has a URL. The pager is gone — `InfiniteGrid` appends, and
 * its control is still an anchor to `?page=2` that the observer presses
 * early rather than a button that only scrolling can reach.
 *
 * The header row is doing more work than it looks: it carries the count,
 * the active filters as removable chips, the sort, and the grid/list
 * toggle. Putting the chips here rather than in the sidebar is what makes
 * a filtered state legible on a phone, where the sidebar is not on screen.
 */
export function Browse({
  page: result,
  facets,
  basePath,
  params,
  isPro = false,
  /** Hidden on pages whose whole point is one filter, e.g. Deals. */
  showFilters = true,
  /** `true` on Deals: the whole page is already `discountedOnly`, so
      re-offering "Under list price" inside the panel and the quick-filter
      row would be a control that toggles a parameter the page has already
      forced — clicking it changes nothing on screen. */
  hideOffersFilter = false,
  departments,
  activeDepartment,
  departmentTitle,
  scope,
}: {
  page: ProductPage;
  facets: ProductFacets;
  /** Path without a query string, e.g. `/products` or `/c/lighting`. */
  basePath: string;
  params: BrowseParams;
  isPro?: boolean;
  showFilters?: boolean;
  hideOffersFilter?: boolean;
  /** Renders the phone's department rail. Omitted on the pages where
      switching department makes no sense — Deals, search results. */
  departments?: {
    id: string;
    slug: string;
    title: string;
    /** Its tile photograph, commissioned or borrowed — see `Category`. */
    photo?: string;
  }[];
  activeDepartment?: string;
  /**
   * The department's own name, for the type row's "All …" chip. Its
   * presence is what turns that row on: the sub-categories only mean
   * something inside one department, and `facets.types` is empty
   * everywhere else anyway.
   */
  departmentTitle?: string;
  /**
   * Filters the page applies that are not in its query string, so the
   * grid can fetch its own next page against the same listing.
   *
   * Deliberately separate from `activeDepartment` and `hideOffersFilter`,
   * which happen to hold the same two facts today and mean something
   * else: one highlights a chip, the other hides a control. A fetch that
   * read its filters off a prop about chip styling is a fetch that breaks
   * the first time someone wants the chip without the filter.
   */
  scope?: BrowseScope;
}) {
  const { items, page, total, totalPages } = result;
  const activeSort = (params.sort as ProductSort | undefined) ?? "name";
  const active = activeFilterCount(params);
  const listView = params.view === "list";
  const showOffers = !hideOffersFilter;
  /* A department page, with more than one shelf in it to choose between.
     One shelf is the whole department under another name. */
  const showTypes = Boolean(departmentTitle) && facets.types.length > 1;
  const fetchQuery = toFetchQuery(params, scope);

  const panel = (
    <FilterPanel
      basePath={basePath}
      params={params}
      facets={facets}
      brandLimit={20}
      showOffers={showOffers}
    />
  );

  return (
    <div className={cn(showFilters && "lg:flex lg:gap-8")}>
      {showFilters && (
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24">
            <h2 className="mb-3 px-2 text-caption font-semibold text-ink">
              Filters
            </h2>
            <FilterPanel
              basePath={basePath}
              params={params}
              facets={facets}
              showOffers={showOffers}
            />
          </div>
        </aside>
      )}

      {/* Clearance for `BrowseActionBar`, which is fixed: its own 52px
          and the home indicator, and no more — the tab bar stands down
          while it is mounted. Without it the last row of tiles and the
          pager sit underneath it. */}
      <div className="min-w-0 flex-1 pb-20 lg:pb-0">
        {/* Phone only, and above the filters on purpose: department is a
            bigger decision than price, so it reads first. */}
        {departments && departments.length > 0 && (
          <DepartmentRail
            categories={departments}
            activeSlug={activeDepartment}
            className="mb-2"
          />
        )}

        {/* No filter controls at the top of a phone screen.

            There were two rows here — Brands / Size / Price, and a strip
            of one-tap toggles — and both opened a sheet that slides up
            from the bottom of the screen. `BrowseActionBar` is already
            pinned down there with Sort and Filters, opening the same kind
            of sheet, reachable by the thumb that is already holding the
            phone, and still reachable after the grid has scrolled.

            So the controls sat at the top, the interaction happened at
            the bottom, and the first product started a third of a screen
            down. Everything the two rows offered — brand, size, price,
            delivery speed, discount, sort — is in the panel behind the
            Filters button, which is where a reader goes when they have
            seen enough of the grid to want to narrow it. That is the
            order the task actually happens in.

            Desktop is untouched: the filter panel is a column beside the
            grid there, costing nothing, and `BrowseActionBar` is phone
            only. */}
        {/* Sidebar and grid, side by side, on a phone.

            The department's shelves used to be a second row of chips
            under the department rail; they are a column now, because a
            horizontal rail of nine shows three. See `TypeSidebar`. The
            sidebar is its own `lg:hidden`, so this wrapper collapses to
            the plain grid on a desktop, where the Type group already
            lives in the filter panel. */}
        <div className="flex items-start gap-0">
          {showTypes && (
            <TypeSidebar
              basePath={basePath}
              params={params}
              types={facets.types}
              allLabel={`All ${departmentTitle!.toLowerCase()}`}
              /* The department's own picture, taken from the row the
                 directory already resolved rather than from
                 `CATEGORY_PHOTOS` directly: a department created after
                 the artwork — Plumbing fittings — has no entry in that
                 map, and reading it here put a "photo coming soon" plate
                 at the top of its sidebar while its tile on the
                 directory showed a real product. `getCategories` does
                 that fallback once, for both. */
              allPhoto={
                departments?.find((d) => d.slug === activeDepartment)?.photo ??
                (activeDepartment ? CATEGORY_PHOTOS[activeDepartment] : undefined)
              }
            />
          )}

          <div className="min-w-0 flex-1">
            <Toolbar
              basePath={basePath}
              params={params}
              activeSort={activeSort}
              listView={listView}
            />

            {/* Phone only. Sort and Filter used to live in the toolbar above,
            which is where a pointer wants them and where a thumb cannot
            reach them once the grid has scrolled. */}
            <BrowseActionBar
              basePath={basePath}
              params={params}
              facets={facets}
              activeSort={activeSort}
              activeCount={active}
              showFilters={showFilters}
              panel={panel}
            />

            {active > 0 && (
              <ActiveChips
                basePath={basePath}
                params={params}
                facets={facets}
                hideOffers={hideOffersFilter}
              />
            )}

            {total === 0 ? (
              <div className="px-5 lg:px-0">
                <EmptyState
                  icon={<Search className="size-6" />}
                  title="Nothing matched"
                  action={
                    active > 0 || params.q
                      ? { href: basePath, label: "Clear filters" }
                      : { href: "/categories", label: "Browse categories" }
                  }
                  secondaryAction={{ href: "/consult", label: "Ask an expert" }}
                >
                  {active > 0
                    ? "No products match every filter at once. Removing one usually finds it."
                    : "Nothing in this section is priced for sale yet. It arrives as merchandising catches up with the import."}
                </EmptyState>
              </div>
            ) : (
              /* Keyed on the query, so changing a filter or a sort replaces
             the component rather than appending the new first page to
             the old one's accumulated rows. */
              <InfiniteGrid
                key={fetchQuery}
                initial={items}
                initialPage={page}
                totalPages={totalPages}
                query={fetchQuery}
                pageHrefTemplate={withParams(basePath, params, {
                  page: "__PAGE__",
                })}
                isPro={isPro}
                listView={listView}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- toolbar */

function Toolbar({
  basePath,
  params,
  activeSort,
  listView,
}: {
  basePath: string;
  params: BrowseParams;
  activeSort: ProductSort;
  listView: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-5 lg:px-0">
      {/* No running total.

          "14 products" sat on its own line above the first row of goods
          and told the reader something the grid underneath it was about
          to show them anyway. On a department of fourteen it is a line
          of type for nothing; on one of five hundred it is a number
          nobody acts on, since the next move is to scroll or to filter
          either way.

          It is still *counted* — `total` drives the paging and the empty
          state, and `InfiniteGrid`'s live region still announces the
          running tally to a screen reader as pages append, which is the
          one audience that cannot see how much is there. */}

      {/* Desktop only. Sort and Filter are in `BrowseActionBar` on a
          phone; what is left here — the sort popover and the grid/list
          toggle — is already `hidden` below `sm`/`lg`, so on a phone
          this row collapses to nothing and its margin is all that is
          left. */}
      <div className="flex items-center gap-2">
        {/* Sort as links inside a details/summary: a popover that needs no
            JavaScript and closes on selection because selecting navigates. */}
        <details className="relative hidden lg:block">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-caption font-medium text-ink transition-colors hover:border-line-strong hover:bg-hover">
            <Sort className="size-4" />
            {SORTS.find((s) => s.id === activeSort)?.label ?? "Sort"}
          </summary>
          <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-line-soft bg-surface py-1 shadow-lg">
            {SORTS.map((s) => (
              <Link
                key={s.id}
                href={withParams(basePath, params, { sort: s.id })}
                aria-current={activeSort === s.id ? "true" : undefined}
                className={cn(
                  "block px-3 py-2 text-body transition-colors hover:bg-hover",
                  activeSort === s.id ? "text-accent" : "text-ink",
                )}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </details>

        {/* Grid or list. A list is what a professional pricing a BOQ
            wants: names in full, SKUs visible, and twenty rows on screen
            instead of six tiles. */}
        <div className="hidden items-center rounded-lg border border-line bg-surface p-0.5 sm:flex">
          <ViewLink
            href={withParams(basePath, params, { view: undefined })}
            selected={!listView}
            label="Grid view"
          >
            <Grid className="size-4" />
          </ViewLink>
          <ViewLink
            href={withParams(basePath, params, { view: "list" })}
            selected={listView}
            label="List view"
          >
            <Menu className="size-4" />
          </ViewLink>
        </div>
      </div>
    </div>
  );
}

function ViewLink({
  href,
  selected,
  label,
  children,
}: {
  href: string;
  selected: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "grid size-8 place-items-center rounded-md transition-colors",
        selected ? "bg-accent-wash text-accent" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Active filters, as removable chips.
 *
 * The one piece of the filter state that has to be visible on a phone,
 * where the sidebar is behind a button. A grid that has been silently
 * filtered — by a link someone shared, or by a choice made two screens
 * ago — is the most common way a customer concludes the catalogue is
 * empty.
 */
/* No chip for `type`, deliberately.
 *
 * Every other filter here is invisible once it is applied — a brand or a
 * price ceiling set two screens ago leaves nothing on the page to say so,
 * and that is the whole reason this row exists. The sub-category is the
 * opposite: `TypeSidebar` is on screen the entire time with that shelf
 * lit, and tapping it again clears it. A "Health faucets ✕" chip under
 * the row that already says Health faucets is the page repeating itself,
 * and it costs a line above the first product to do it. */
function ActiveChips({
  basePath,
  params,
  facets,
  /** Matches `Browse`'s `hideOffersFilter` — on Deals, `offers` is not a
      removable choice, so it should not appear as one. */
  hideOffers = false,
}: {
  basePath: string;
  params: BrowseParams;
  facets: ProductFacets;
  hideOffers?: boolean;
}) {
  const chips: { label: string; href: string }[] = [];

  if (params.brand) {
    const brand = facets.brands.find((b) => b.slug === params.brand);
    chips.push({
      label: brand?.name ?? params.brand,
      href: withParams(basePath, params, { brand: undefined }),
    });
  }
  if (params.fulfilment) {
    chips.push({
      label:
        FULFILMENT_LABEL[params.fulfilment as FulfilmentType] ??
        params.fulfilment,
      href: withParams(basePath, params, { fulfilment: undefined }),
    });
  }
  if (params.unit) {
    chips.push({
      label: PRICING_UNIT_LABEL[params.unit as PricingUnit] ?? params.unit,
      href: withParams(basePath, params, { unit: undefined }),
    });
  }
  if (params.min || params.max) {
    chips.push({
      label: `₹${params.min ?? "0"} – ₹${params.max ?? "any"}`,
      href: withParams(basePath, params, { min: undefined, max: undefined }),
    });
  }
  if (params.offers && !hideOffers) {
    chips.push({
      label: "Under list price",
      href: withParams(basePath, params, { offers: undefined }),
    });
  }

  return (
    <ul className="mb-4 flex flex-wrap gap-2 px-5 lg:px-0">
      {chips.map((chip) => (
        <li key={chip.label}>
          <Link
            href={chip.href}
            className="group flex items-center gap-1.5 rounded-full border border-accent-edge bg-accent-wash px-3 py-1.5 text-caption text-accent transition-colors hover:bg-accent hover:text-on-accent"
          >
            {chip.label}
            <span aria-hidden className="text-micro">
              ✕
            </span>
            <span className="sr-only">Remove filter</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
