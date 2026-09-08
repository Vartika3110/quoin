"use client";

import { useMemo, type ReactNode } from "react";
import { useColumnCount } from "@/lib/store/media";
import { cn } from "@/components/ui/cn";

/**
 * A masonry grid that does not jump.
 *
 * Every other approach was tried against the same requirement — appending
 * a page of forty photographs must not move the forty already on screen:
 *
 *  - **CSS `columns`** fills column one to the bottom before starting
 *    column two. Appending re-flows every tile, and the tab order runs
 *    down one column and back up, which is unusable with a keyboard.
 *  - **`grid-template-rows: masonry`** is Firefox-only.
 *  - **Measuring the DOM** needs the images to have loaded, so the layout
 *    settles a second after the page does, in full view.
 *
 * So the assignment is arithmetic, done here: each tile's aspect ratio is
 * known from the database before a single byte of image is fetched, and
 * every tile goes into whichever column is currently shortest. That is
 * stable under append — a new tile cannot change where an existing one
 * went — and it is identical on the server and the client for a given
 * column count.
 *
 * Heights are accumulated in *relative* units (`height / width`), never
 * pixels. The real column width is whatever flexbox gives it at this
 * viewport; the ratios are what decide the balance, and they are
 * resolution-independent.
 *
 * ## Reading order
 *
 * Columns are a visual arrangement, not a sequence, so the whole grid is
 * one `<ul>` per column inside a presentational wrapper. A screen reader
 * reads column one and then column two, which is the same order the eye
 * takes going down a Pinterest-shaped page, and each column announces its
 * own length rather than the grid claiming an order it does not have.
 */
export function Masonry<T>({
  items,
  keyOf,
  ratioOf,
  render,
  gap = "gap-3 lg:gap-4",
  className,
  label,
}: {
  items: T[];
  keyOf: (item: T) => string;
  /** `height / width`. A tall portrait is 1.5, a wide landscape 0.66. */
  ratioOf: (item: T) => number;
  render: (item: T, index: number) => ReactNode;
  gap?: string;
  className?: string;
  /** Names the grid for a screen reader — "Inspiration", "Saved ideas". */
  label: string;
}) {
  const columnCount = useColumnCount();

  const columns = useMemo(() => {
    const buckets: { items: T[]; height: number }[] = Array.from(
      { length: columnCount },
      () => ({ items: [], height: 0 }),
    );

    for (const item of items) {
      /* Shortest column wins; ties go left, which is what `<` rather than
         `<=` buys — a page of identical squares then fills left to right
         in reading order instead of zig-zagging. */
      let target = buckets[0];
      for (const bucket of buckets) {
        if (bucket.height < target.height) target = bucket;
      }
      target.items.push(item);

      /* Guarded against a zero or negative ratio, which would make a
         column infinitely attractive and put every remaining tile in it.
         Bad dimensions are a data problem, not a reason for one column of
         four hundred photographs. */
      const ratio = ratioOf(item);
      target.height += Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    }

    return buckets.map((b) => b.items);
  }, [items, columnCount, ratioOf]);

  /* An index across the whole grid, not within a column — callers use it
     to decide which handful of tiles are above the fold and worth
     preloading, and that is a question about the page, not the column. */
  const indexOf = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(keyOf(item), i));
    return map;
  }, [items, keyOf]);

  return (
    <div className={cn("flex items-start", gap, className)}>
      {columns.map((column, columnIndex) => (
        <ul
          key={columnIndex}
          className={cn("flex min-w-0 flex-1 flex-col", gap)}
          /* Only the first column is labelled, or a screen reader
             announces "Inspiration" five times on one page. */
          aria-label={columnIndex === 0 ? label : undefined}
        >
          {column.map((item) => {
            const key = keyOf(item);
            return <li key={key}>{render(item, indexOf.get(key) ?? 0)}</li>;
          })}
        </ul>
      ))}
    </div>
  );
}

/**
 * The grid, while it is loading.
 *
 * Uses the same column count and a repeating cycle of plausible aspect
 * ratios, so the skeleton has the ragged bottom edge a real feed has. A
 * grid of identical rectangles that resolves into a ragged one is a
 * second layout shift dressed up as a loading state.
 */
export function MasonrySkeleton({ count = 16 }: { count?: number }) {
  const columnCount = useColumnCount();

  /* Portrait, square, landscape, tall. Deliberately not random: a random
     skeleton re-rolls on every render and flickers. */
  const RATIOS = [1.4, 1, 0.7, 1.25, 0.8, 1.55];

  const columns = useMemo(() => {
    const buckets: { ratios: number[]; height: number }[] = Array.from(
      { length: columnCount },
      () => ({ ratios: [], height: 0 }),
    );
    for (let i = 0; i < count; i++) {
      let target = buckets[0];
      for (const bucket of buckets) if (bucket.height < target.height) target = bucket;
      const ratio = RATIOS[i % RATIOS.length];
      target.ratios.push(ratio);
      target.height += ratio;
    }
    return buckets.map((b) => b.ratios);
    /* RATIOS is a module-level constant in spirit; listing it would make
       this re-run on every render for no reason. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnCount, count]);

  return (
    <div className="flex items-start gap-3 lg:gap-4" aria-hidden>
      {columns.map((ratios, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-3 lg:gap-4">
          {ratios.map((ratio, j) => (
            <div
              key={j}
              className="skeleton rounded-xl"
              style={{ aspectRatio: `1 / ${ratio}` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
