"use client";

import Link from "next/link";
import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Check, ChevronDown } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { PRICING_UNIT_LABEL, type PricingUnit } from "@/lib/types/catalog";
import type { ProductFacets } from "@/lib/data/catalog";
import {
  PRICE_BUCKETS,
  activeBucketId,
  withParams,
  type BrowseParams,
} from "@/lib/browse-params";

/**
 * The design prototype's chip row, on a phone.
 *
 * Three chips, not the prototype's four. The fourth — "Type", a
 * sub-category facet — has nothing behind it: `Category.parentId` is null
 * on every row in the catalogue (the import files a flat list; see
 * `docs/django-to-prisma.md`), so there is no "type" to narrow within a
 * category, not sometimes but always. A chip that opens a sheet reading
 * "No options available" on every single tap is not a disabled control,
 * it is a broken one — so it is omitted rather than rendered inert. It
 * returns the moment a category gets children.
 *
 * Each chip is a thin view over the same `BrowseParams` the sidebar
 * `FilterPanel` and the URL already carry — a `Link` per option, exactly
 * like `SortSheet` and `FilterPanel` itself. There is no local filter
 * state to fall out of sync: picking an option here is the same
 * navigation picking it in the full drawer would be, and the full drawer
 * still opens through `FilterDrawer` for everything these three chips
 * don't cover (delivery, discount).
 */
export function FilterChipRow({
  basePath,
  params,
  facets,
}: {
  basePath: string;
  params: BrowseParams;
  facets: ProductFacets;
}) {
  const [open, setOpen] = useState<"brand" | "unit" | "price" | null>(null);

  const brandLabel = facets.brands.find((b) => b.slug === params.brand)?.name;
  const unitLabel = params.unit
    ? PRICING_UNIT_LABEL[params.unit as PricingUnit]
    : undefined;
  const activeBucket = PRICE_BUCKETS.find((b) => b.id === activeBucketId(params));
  /* A custom range typed into the full drawer's price form has no bucket
     to match — the chip still has to read as active, just without a
     bucket label to borrow. */
  const priceActive = Boolean(params.min || params.max);

  return (
    <>
      <div className="grid grid-cols-3 gap-2 px-5 lg:hidden">
        <Chip
          label={brandLabel ?? "Brands"}
          active={Boolean(params.brand)}
          onClick={() => setOpen("brand")}
        />
        <Chip
          label={unitLabel ?? "Size"}
          active={Boolean(params.unit)}
          onClick={() => setOpen("unit")}
          disabled={facets.pricingUnits.length <= 1}
        />
        <Chip
          label={activeBucket?.label ?? "Price"}
          active={priceActive}
          onClick={() => setOpen("price")}
        />
      </div>

      <FacetSheet
        title="Filter by brand"
        open={open === "brand"}
        onClose={() => setOpen(null)}
        clearHref={withParams(basePath, params, { brand: undefined })}
        cleared={!params.brand}
        options={facets.brands.map((b) => ({
          href: withParams(basePath, params, { brand: b.slug }),
          label: b.name,
          count: b.count,
          selected: params.brand === b.slug,
        }))}
      />

      <FacetSheet
        title="Filter by size"
        open={open === "unit"}
        onClose={() => setOpen(null)}
        clearHref={withParams(basePath, params, { unit: undefined })}
        cleared={!params.unit}
        options={facets.pricingUnits.map((u) => ({
          href: withParams(basePath, params, { unit: u.id }),
          label: PRICING_UNIT_LABEL[u.id],
          count: u.count,
          selected: params.unit === u.id,
        }))}
      />

      <FacetSheet
        title="Filter by price"
        open={open === "price"}
        onClose={() => setOpen(null)}
        clearHref={withParams(basePath, params, { min: undefined, max: undefined })}
        cleared={!priceActive}
        options={PRICE_BUCKETS.map((bucket) => ({
          href: withParams(basePath, params, { min: bucket.min, max: bucket.max }),
          label: bucket.label,
          selected: bucket.id === activeBucket?.id,
        }))}
      />
    </>
  );
}

function Chip({
  label,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-caption font-semibold transition-colors disabled:opacity-40",
        active
          ? "border-accent bg-accent-wash text-accent"
          : "border-line bg-surface text-ink",
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3.5 shrink-0" />
    </button>
  );
}

/**
 * The bottom sheet behind each chip.
 *
 * Same shape as the prototype's `FilterSheet` — a title, an "All" row to
 * clear, then the option list, single-select — rebuilt on `Drawer` and on
 * `Link`s rather than local `selected` state and an `onSelect` callback,
 * so a tap here is a real navigation like every other filter control in
 * this codebase, not a second write path into filter state.
 */
function FacetSheet({
  title,
  open,
  onClose,
  clearHref,
  cleared,
  options,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  clearHref: string;
  cleared: boolean;
  options: { href: string; label: string; count?: number; selected: boolean }[];
}) {
  return (
    <Drawer open={open} onClose={onClose} title={title} side="bottom">
      <ul className="p-2 pb-4">
        <li>
          <Link
            href={clearHref}
            onClick={onClose}
            aria-current={cleared ? "true" : undefined}
            className={cn(
              "flex min-h-13 items-center justify-between gap-3 rounded-lg px-3 text-body transition-colors active:bg-hover",
              cleared ? "font-medium text-accent" : "text-ink",
            )}
          >
            All
            {cleared && <Check className="size-4.5 shrink-0" />}
          </Link>
        </li>
        {options.map((option) => (
          <li key={option.href}>
            <Link
              href={option.href}
              onClick={onClose}
              aria-current={option.selected ? "true" : undefined}
              className={cn(
                "flex min-h-13 items-center justify-between gap-3 rounded-lg px-3 text-body transition-colors active:bg-hover",
                option.selected ? "font-medium text-accent" : "text-ink",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="flex shrink-0 items-center gap-2">
                {option.count != null && (
                  <span className="nums text-micro text-faint">{option.count}</span>
                )}
                {option.selected && <Check className="size-4.5 shrink-0" />}
              </span>
            </Link>
          </li>
        ))}
        {options.length === 0 && (
          <li className="px-3 py-4 text-center text-caption text-faint">
            No options for the current selection.
          </li>
        )}
      </ul>
    </Drawer>
  );
}
