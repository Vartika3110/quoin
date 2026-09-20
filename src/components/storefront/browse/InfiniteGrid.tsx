"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ProductRow } from "@/components/storefront/browse/ProductRow";
import { Spinner } from "@/components/ui/Spinner";
import type { Product } from "@/lib/types/catalog";

/**
 * The listing, continued.
 *
 * A pager is the right control for a professional pricing a bill of
 * quantities on a desktop — "page 4 of 107" is a position you can come
 * back to. It is the wrong one on a phone, where the next twenty-four
 * products are the whole reason the page is being scrolled and a
 * 44px "Next" at the bottom is a toll booth charging a tap and a page
 * load to pass.
 *
 * So: the server still renders page one, and the URL still has a real
 * `?page=`. This appends what comes after it.
 *
 * **The "Show more" control is a real link, and that is deliberate.**
 * It points at the page after the last one loaded and it works with no
 * JavaScript, with a middle-click, and when the fetch fails — the
 * observer below simply presses it early. An infinite list whose only
 * affordance is a
 * side-effect of scrolling is one that a crawler sees twenty-four
 * products of, and that a customer on a failing connection sees no way
 * out of.
 *
 * Nothing here rewrites the URL as pages accumulate. A `?page=6` in the
 * address bar after scrolling would mean a reload shows products 121–144
 * with the first hundred and twenty silently missing, which is a worse
 * lie than the address bar being a page behind.
 */
export function InfiniteGrid({
  initial,
  initialPage,
  totalPages,
  query,
  pageHrefTemplate,
  isPro,
  listView,
}: {
  /** Page one, rendered on the server. */
  initial: Product[];
  initialPage: number;
  totalPages: number;
  /**
   * The query string to fetch subsequent pages with, without `page` —
   * built by the server so the fetch and the page agree on what is being
   * listed, including the bits that are not in the URL (`category` on a
   * department page, `offers` on Deals).
   */
  query: string;
  /**
   * The listing URL with `__PAGE__` where the page number goes.
   *
   * A template rather than a finished `nextHref`, because the server only
   * knows about page one: a fixed href still pointed at `?page=2` after
   * five pages had been appended, so a middle-click — or a "Try again"
   * after a failure deep in the list — sent the reader back to products
   * they had already scrolled past. The link has to track what the grid
   * has actually loaded, and only the client knows that.
   */
  pageHrefTemplate: string;
  isPro: boolean;
  listView: boolean;
}) {
  /* Only the pages fetched here. `initial` stays a prop so a new server
     render — a filter change, a sort — replaces it without this state
     having to be told; see the `key` at the call site. */
  const [appended, setAppended] = useState<Product[]>([]);
  const [page, setPage] = useState(initialPage);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");

  const done = page >= totalPages;

  /* Held in a ref as well as state because the observer's callback closes
     over the value it was created with, and re-creating the observer on
     every status change would have it fire again for a sentinel that is
     already on screen. */
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current || page >= totalPages) return;
    busy.current = true;
    setStatus("loading");

    const next = page + 1;

    try {
      const response = await fetch(
        `/api/v1/products?${query}${query ? "&" : ""}page=${next}`,
      );
      if (!response.ok) throw new Error(String(response.status));

      const body = await response.json();
      const items: Product[] = body.data.items;

      setAppended((current) => [...current, ...items]);
      setPage(next);
      setStatus("idle");
    } catch {
      /* The link is still on screen and still goes to `?page=N`, so a
         failure here costs a full page load rather than the rest of the
         catalogue. */
      setStatus("failed");
    } finally {
      busy.current = false;
    }
  }, [page, totalPages, query]);

  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || done) return;
    /* Nothing auto-loads again until the last attempt is retried by hand.
       Re-arming on scroll would retry a failing request every time the
       sentinel crossed the viewport, which on a dead connection is a
       request per flick. */
    if (status === "failed") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      /* Starts fetching a screen and a half early, so the next rows are
         usually there before the scroll reaches them. */
      { rootMargin: "800px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, done, status]);

  const items = [...initial, ...appended];
  /* Tracks what has actually been loaded, not what the server rendered. */
  const nextHref = pageHrefTemplate.replace("__PAGE__", String(page + 1));

  return (
    <>
      {listView ? (
        <ul className="divide-y divide-line-hair border-y border-line-hair">
          {items.map((product) => (
            <ProductRow key={product.id} product={product} isPro={isPro} />
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-3 lg:px-0 xl:grid-cols-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} isPro={isPro} fill />
          ))}
        </div>
      )}

      {/* Announced rather than only drawn: a list that grows under the
          reader is a change a screen reader has no other way to learn
          about. Polite, so it waits for a pause rather than interrupting. */}
      <p aria-live="polite" className="sr-only">
        {status === "loading"
          ? "Loading more products"
          : `Showing ${items.length} products`}
      </p>

      {!done && (
        <div ref={sentinel} className="mt-8 flex flex-col items-center gap-3 px-5 lg:px-0">
          {status === "loading" ? (
            <Spinner className="size-5 text-muted" />
          ) : (
            <>
              {status === "failed" && (
                <p className="text-caption text-muted">
                  Could not load more products.
                </p>
              )}
              <Link
                href={nextHref}
                onClick={(e) => {
                  /* Let a modified click through — a middle-click or
                     cmd-click on a real link should open a real page. */
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  void loadMore();
                }}
                className="flex min-h-11 items-center rounded-lg border border-line px-5 text-caption font-medium text-ink transition-colors hover:border-line-strong hover:bg-hover"
              >
                {status === "failed" ? "Try again" : "Show more"}
              </Link>
            </>
          )}
        </div>
      )}
    </>
  );
}
