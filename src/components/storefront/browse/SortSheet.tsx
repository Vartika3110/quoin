"use client";

import Link from "next/link";
import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Check, Sort } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { SORTS, withParams, type BrowseParams } from "@/lib/browse-params";
import type { ProductSort } from "@/lib/data/catalog";

/**
 * Sorting, as a bottom sheet.
 *
 * The desktop keeps its `<details>` popover — a pointer near the control
 * wants a menu under it. A phone does not: a 180px popover anchored to a
 * button in the top-right corner is a menu the thumb has to reach for, and
 * the options land under the finger that opened it.
 *
 * The options are links, so choosing one navigates and the sheet unmounts
 * with the page. There is no "apply" step and no state to keep in sync
 * with the URL.
 */
export function SortSheet({
  basePath,
  params,
  activeSort,
}: {
  basePath: string;
  params: BrowseParams;
  activeSort: ProductSort;
}) {
  const [open, setOpen] = useState(false);
  const current = SORTS.find((s) => s.id === activeSort);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-caption font-medium text-ink transition-colors active:bg-hover lg:hidden"
      >
        <Sort className="size-4" />
        Sort
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Sort by"
        side="bottom"
      >
        <ul className="p-2 pb-4">
          {SORTS.map((sort) => {
            const on = sort.id === activeSort;
            return (
              <li key={sort.id}>
                <Link
                  href={withParams(basePath, params, { sort: sort.id })}
                  onClick={() => setOpen(false)}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "flex min-h-13 items-center justify-between gap-3 rounded-lg px-3 text-body transition-colors active:bg-hover",
                    on ? "font-medium text-accent" : "text-ink",
                  )}
                >
                  {sort.label}
                  {on && <Check className="size-4.5 shrink-0" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </Drawer>

      <span className="sr-only">Currently sorted by {current?.label}</span>
    </>
  );
}
