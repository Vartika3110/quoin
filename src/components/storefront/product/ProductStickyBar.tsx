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
  const variant = product.variants[0];
  const line = find(product.slug, variant.id);

  const simple = product.variants.length === 1 && product.fulfilment !== "bookable";

  return (
    <StickyBar>
      <div className="min-w-0 flex-1">
        <p className="nums text-title-sm font-semibold text-ink">
          {formatPrice(price.amount)}
        </p>
        <p className="truncate text-micro text-muted">
          {price.isFrom ? "onwards" : PRICING_UNIT_LABEL[product.pricingUnit]}
          {price.strikethrough && (
            <span className="nums ml-1.5 line-through">
              {formatPrice(price.strikethrough)}
            </span>
          )}
        </p>
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
