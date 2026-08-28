import Link from "next/link";
import { ProductCard } from "@/components/storefront/ProductCard";
import { Chevron } from "@/components/icons";
import type { ProductPage, ProductSort } from "@/lib/data/catalog";

const SORTS: { id: ProductSort; label: string }[] = [
  { id: "name", label: "A–Z" },
  { id: "newest", label: "Newest" },
  { id: "price", label: "Price" },
];

/** Rebuilds the current URL with one parameter changed. */
function withParam(
  base: string,
  current: Record<string, string | undefined>,
  key: string,
  value: string | undefined,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, [key]: value })) {
    if (v) next.set(k, v);
  }
  /* Changing the sort or a filter must not keep you on page 7 of a
     result set that no longer has seven pages. */
  if (key !== "page") next.delete("page");

  const qs = next.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Product browsing.
 *
 * Sort and paging are plain links rather than client-side state: the
 * result is shareable, back works, and the page needs no JavaScript to
 * function. The cost is a round trip per interaction, which is the right
 * trade until there is a filter panel worth keeping open.
 */
export function Browse({
  page: result,
  basePath,
  params,
  isPro = false,
}: {
  page: ProductPage;
  /** Path without a query string, e.g. `/products` or `/c/lighting`. */
  basePath: string;
  /** The current query, so links preserve filters they do not change. */
  params: Record<string, string | undefined>;
  isPro?: boolean;
}) {
  const { items, page, pageSize, total, totalPages } = result;

  if (total === 0) {
    return (
      <div className="px-5 py-16 text-center lg:px-0">
        <p className="text-ink">Nothing here yet.</p>
        <p className="mt-1 text-sm text-muted">
          Try a different category, or clear the search.
        </p>
        <Link
          href={basePath}
          className="mt-4 inline-block text-sm text-accent hover:text-accent-bright"
        >
          Clear filters
        </Link>
      </div>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const activeSort = (params.sort as ProductSort | undefined) ?? "name";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-5 lg:px-0">
        <p className="text-xs text-muted">
          {first}–{last} of {total}
        </p>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted">Sort</span>
          {SORTS.map((s) => (
            <Link
              key={s.id}
              href={withParam(basePath, params, "sort", s.id)}
              aria-current={activeSort === s.id ? "true" : undefined}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                activeSort === s.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 lg:grid-cols-4 lg:px-0 xl:grid-cols-5">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} isPro={isPro} />
        ))}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-8 flex items-center justify-center gap-4 px-5 lg:px-0"
        >
          <PageLink
            href={withParam(basePath, params, "page", String(page - 1))}
            disabled={page <= 1}
            label="Previous"
          >
            <Chevron className="size-3.5 rotate-180" />
            Previous
          </PageLink>

          <span className="text-xs text-muted">
            Page {page} of {totalPages}
          </span>

          <PageLink
            href={withParam(basePath, params, "page", String(page + 1))}
            disabled={page >= totalPages}
            label="Next"
          >
            Next
            <Chevron className="size-3.5" />
          </PageLink>
        </nav>
      )}
    </>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className =
    "flex items-center gap-1 rounded-full border px-4 py-2 text-xs transition-colors";

  /* A disabled control must not be a link — a span cannot be focused or
     followed, which is the behaviour screen readers and keyboards expect. */
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${className} border-line-soft text-faint`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={`${className} border-line text-ink hover:border-accent hover:text-accent`}
    >
      {children}
    </Link>
  );
}
