"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { CartDrawer } from "@/components/storefront/nav/CartDrawer";
import { Cart, Chevron } from "@/components/icons";
import { useCart } from "@/lib/store/cart";
import { useStickyBarTaken } from "@/components/storefront/StickyBar";
import { formatPrice } from "@/lib/types/catalog";

/**
 * The floating cart bar.
 *
 * The single most useful thing a phone storefront can put on screen: what
 * is in the basket and what it costs, permanently, without leaving the
 * grid. Someone adding cement, then steel, then tiles never has to
 * navigate away to check where the total has got to.
 *
 * Three rules keep it from becoming clutter:
 *
 *  - **It appears only when there is something in it.** An empty bar is a
 *    permanent 60px of chrome saying nothing.
 *  - **It hides on the screens that already show the cart** — the cart
 *    itself and checkout both have their own totals, and two totals on one
 *    screen invite comparison. It also stands down wherever a page mounts
 *    its own `StickyBar`, so a product page's Add button and this never
 *    stack on the same strip.
 *  - **Phones only.** On a desktop the header's cart button is always
 *    visible; a bar pinned across a 1440px screen reads as a phone app in
 *    a window.
 *
 * Tapping it opens the same drawer the header opens, rather than
 * navigating — the fastest thing after "what is in my cart" is usually
 * "carry on shopping".
 */

/** Screens whose own content already carries the total. */
const SILENT_PATHS = ["/cart", "/checkout"];

export function CartBar() {
  const pathname = usePathname();
  const { count, subtotalPaise, ready } = useCart();
  const stickyTaken = useStickyBarTaken();
  const [open, setOpen] = useState(false);

  const hidden =
    !ready ||
    count === 0 ||
    /* A page with its own action bar owns the strip — see StickyBar. */
    stickyTaken ||
    SILENT_PATHS.some((p) => pathname.startsWith(p));

  if (hidden) return null;

  return (
    <>
      <div className="anim-rise fixed inset-x-0 bottom-[max(3.75rem,calc(3.25rem_+_env(safe-area-inset-bottom)))] z-30 px-4 pb-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl bg-deep px-4 py-3 text-left shadow-lg transition-colors hover:bg-deep-soft"
        >
          <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-on-deep">
            <Cart className="size-4.5" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="nums block text-caption text-on-deep/70">
              {count} {count === 1 ? "item" : "items"}
            </span>
            <span className="nums block text-body font-semibold text-on-deep">
              {formatPrice(subtotalPaise)}
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-1 text-caption font-semibold text-on-deep">
            View cart
            <Chevron className="size-4" />
          </span>
        </button>
      </div>

      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
