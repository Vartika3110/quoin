"use client";

import { StickyBar } from "@/components/storefront/StickyBar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { Calendar, Cart, Minus, Plus, Trash } from "@/components/icons";
import { useCart } from "@/lib/store/cart";
import {
  PRICING_UNIT_LABEL,
  formatPrice,
  resolvePrice,
  resolveVariantPrice,
  type Product,
} from "@/lib/types/catalog";

/**
 * The product page's sticky action bar, on a phone.
 *
 * A buy box a screen and a half above the fold is a buy box people scroll
 * back up to find. This keeps the price and the action under the thumb for
 * the whole page, which is the single biggest difference between a
 * responsive website and something that feels like an app.
 *
 * It does not duplicate the buy box's logic. Where the choice is
 * unambiguous — one variant, not a booking — it adds directly and then
 * becomes a stepper. Where it is not, it scrolls to the real panel, because
 * a sticky bar that quietly picks a pack size for you is worse than one
 * that takes you to the choice.
 */
export function ProductStickyBar({
  product,
  isPro = false,
}: {
  product: Product;
  isPro?: boolean;
}) {
  const { add, setQty, find } = useCart();
  const toast = useToast();

  const price = resolvePrice(product, isPro);

  /* Whichever option of this product is already in the basket, if the
     customer has settled on exactly one.

     Thirteen products have two options now — see
     `scripts/merge-sibling-variants.ts` — and until this looked for them
     the bar said "Choose options" forever: you picked a tint in the
     panel, added it, and the bar under your thumb still offered to take
     you back to a choice you had already made. Exactly one line, because
     with two tints of the same adhesive in the basket there is no single
     quantity for this bar to step, and guessing which one the customer
     meant is worse than sending them to the panel that shows both. */
  const lines = product.variants.flatMap((v) => find(product.slug, v.id) ?? []);
  const line = lines.length === 1 ? lines[0] : undefined;
  const variant =
    product.variants.find((v) => v.id === line?.variantId) ??
    product.variants[0];

  const simple =
    product.fulfilment !== "bookable" &&
    (product.variants.length === 1 || lines.length === 1);

  /* The price of the thing the bar is actually about: the option in the
     basket when there is one, the "from" price of the cheapest when the
     customer has not chosen yet. */
  const shown = line ? resolveVariantPrice(variant, isPro) : price;

  return (
    <StickyBar>
      {/* Quantity, price, tax position — the reference's three-line
          stack, and the order they are read in. The figure is the middle
          line because it is the one being decided on; the unit above it
          is what stops "₹495" meaning nothing (per bag, per piece and
          per running foot are all live in this catalogue); the tax line
          is the standing promise under both. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-micro text-muted">
          {line
            ? `${line.qty} × ${PRICING_UNIT_LABEL[product.pricingUnit]}`
            : shown.isFrom
              ? "onwards"
              : PRICING_UNIT_LABEL[product.pricingUnit]}
          {line && product.variants.length > 1 && ` · ${variant.label}`}
        </p>

        <p className="flex items-baseline gap-1.5 leading-tight">
          <span className="nums text-title-sm font-semibold text-ink">
            {formatPrice(shown.amount)}
          </span>
          {shown.strikethrough && (
            <span className="nums text-caption text-faint line-through">
              MRP {formatPrice(shown.strikethrough)}
            </span>
          )}
        </p>

        <p className="truncate text-micro text-faint">Inclusive of all taxes</p>
      </div>

      {!simple ? (
        <Button
          size="lg"
          className="shrink-0"
          onClick={() =>
            document
              .getElementById("buy")
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          {product.fulfilment === "bookable" ? (
            <>
              <Calendar className="size-4.5" />
              Book a slot
            </>
          ) : (
            "Choose options"
          )}
        </Button>
      ) : line ? (
        <div className="flex h-13 shrink-0 items-center rounded-lg bg-accent text-on-accent">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQty(line.id, line.qty - variant.stepQty)}
            className="grid size-13 place-items-center rounded-l-lg transition-colors hover:bg-accent-dim"
          >
            {line.qty <= variant.minQty ? (
              <Trash className="size-4.5" />
            ) : (
              <Minus className="size-4.5" />
            )}
          </button>
          <span
            className={cn("nums min-w-12 text-center text-body font-semibold")}
            aria-live="polite"
          >
            {line.qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty(line.id, line.qty + variant.stepQty)}
            className="grid size-13 place-items-center rounded-r-lg transition-colors hover:bg-accent-dim"
          >
            <Plus className="size-4.5" />
          </button>
        </div>
      ) : (
        <Button
          size="lg"
          className="shrink-0"
          onClick={() => {
            add(product, variant, variant.minQty);
            toast.success(`Added ${product.title}`);
          }}
        >
          <Cart className="size-4.5" />
          Add to cart
        </Button>
      )}
    </StickyBar>
  );
}
