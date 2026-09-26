"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Button } from "@/components/ui/Button";
import { Check, Plus } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { useCart } from "@/lib/store/cart";
import { formatPrice, PRICING_UNIT_LABEL } from "@/lib/types/catalog";
import { formatClock, type RoomMaterial } from "@/lib/types/studio";

/** Six is a screenful on a phone and about half the panel on a desktop.
    Past that the list stops being "what this room is made of" and starts
    being a spreadsheet, so the rest is one tap away. */
const VISIBLE = 6;

/**
 * What the room is made of, priced.
 *
 * Every line is the catalogue's own row — the same title, the same brand,
 * the same price a product page would show — because this is the number
 * the footer totals and the number somebody may act on. Nothing here is
 * a figure Studio invented.
 *
 * The number on the left is the dot on the photograph. Selecting a row
 * and selecting a dot are the same act, and the highlight is drawn on
 * whichever one the reader did not touch.
 *
 * `onSelect` is handed the row's number and never null. It used to
 * toggle here, which was right while a pin was only ever a photograph
 * and wrong the moment one could be a clip: on a clip a tap means "take
 * me to that moment", and a second tap on the same row means it again —
 * there is nothing to deselect *to*, because the clip is still playing
 * and still on that line. Whether a repeat tap clears the highlight is
 * now the caller's decision, made once in `PinDetail` where both kinds
 * of pin are in view.
 */
export function MaterialsList({
  materials,
  selected,
  onSelect,
}: {
  materials: RoomMaterial[];
  selected: number | null;
  /** The row's number, always — never null. See the note above. */
  onSelect: (n: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? materials : materials.slice(0, VISIBLE);
  const hidden = materials.length - shown.length;

  return (
    <div>
      <h3 className="font-display px-5 text-title-sm font-semibold text-ink lg:px-0">
        Materials in this room
      </h3>

      <ul className="mt-3 flex flex-col">
        {shown.map((line) => (
          <MaterialRow
            key={line.id}
            line={line}
            on={selected === line.number}
            onSelect={() => onSelect(line.number)}
          />
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="tap-target mx-5 mt-2 text-caption font-medium text-accent hover:underline lg:mx-0"
        >
          Show {hidden} more
        </button>
      )}
    </div>
  );
}

function MaterialRow({
  line,
  on,
  onSelect,
}: {
  line: RoomMaterial;
  on: boolean;
  onSelect: () => void;
}) {
  const { add, find } = useCart();
  const inCart = Boolean(find(line.product.slug, line.variant.id));

  return (
    <li
      /* The row is the highlight target, not a button wrapping the whole
         thing: it already contains a link to the product and an Add
         button, and nesting either inside a button is invalid and
         behaves differently in every browser. The number is the control
         that selects it. */
      className={cn(
        "flex items-start gap-3 border-b border-line-hair px-5 py-3 transition-colors last:border-b-0 lg:px-0",
        on && "bg-accent-wash",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={on}
        aria-label={
          line.atSeconds === null
            ? `Highlight ${line.product.title}`
            : `Play from ${formatClock(line.atSeconds)} — ${line.product.title}`
        }
        className={cn(
          "nums mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-micro font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          on ? "bg-accent text-on-accent" : "bg-sunk text-muted hover:bg-hover",
        )}
      >
        {line.number}
      </button>

      {/* The second this line is on screen, on a clip. Not a separate
          control — the number beside it already seeks there — but the
          reader has no other way to know that tapping 7 will move the
          clip, or that line 7 comes before line 9. Absent on a
          photograph and on a line the clip never frames. */}
      {line.atSeconds !== null && (
        <span className="nums mt-0.5 shrink-0 self-start text-micro tabular-nums text-faint">
          {formatClock(line.atSeconds)}
        </span>
      )}

      <Link
        href={`/p/${line.product.slug}`}
        className="size-12 shrink-0 overflow-hidden rounded-lg border border-photo-edge bg-photo"
      >
        <ProductImage
          photo={line.product.photo}
          swatchKey={line.product.image}
          label={line.product.title}
          brand={line.product.brand}
          className="size-full"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/p/${line.product.slug}`}
          className="line-clamp-2 text-body-sm font-medium text-ink hover:text-accent"
        >
          {line.product.title}
        </Link>
        <p className="mt-0.5 line-clamp-1 text-micro text-muted">
          {[line.product.brand, line.variant.label].filter(Boolean).join(" · ")}
        </p>
        <p className="nums mt-0.5 text-micro text-faint">
          {formatPrice(line.variant.price)} {PRICING_UNIT_LABEL[line.product.pricingUnit]}
          {" · "}
          {line.qty}
          {line.unit ? ` ${line.unit}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="nums text-body-sm font-semibold text-ink">
          {formatPrice(line.linePaise)}
        </span>
        <Button
          size="sm"
          variant={inCart ? "outline" : "subtle"}
          disabled={inCart}
          onClick={() => add(line.product, line.variant, line.qty)}
        >
          {inCart ? (
            <>
              <Check className="size-3.5" />
              Added
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Add
            </>
          )}
        </Button>
      </div>
    </li>
  );
}
