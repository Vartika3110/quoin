"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { CartDrawer } from "@/components/storefront/nav/CartDrawer";
import { Cart, Chevron } from "@/components/icons";
import { useCart } from "@/lib/store/cart";
import { useStickyBarTaken } from "@/components/storefront/StickyBar";
import { ProductImage } from "@/components/storefront/ProductImage";
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
  const { count, subtotalPaise, ready, lines } = useCart();
  const stickyTaken = useStickyBarTaken();
  const [open, setOpen] = useState(false);

  const hidden =
    !ready ||
    count === 0 ||
    /* A page with its own action bar owns the strip — see StickyBar. */
    stickyTaken ||
    SILENT_PATHS.some((p) => pathname.startsWith(p));

  if (hidden) return null;

  /* Newest first, so adding something shows it. */
  const thumbs = [...lines].sort((a, b) => b.addedAt - a.addedAt).slice(0, 3);

  return (
    <>
      <div className="anim-rise fixed inset-x-0 bottom-[max(3.75rem,calc(3.25rem_+_env(safe-area-inset-bottom)))] z-30 px-4 pb-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          /* The accent, not `bg-deep`.
           *
           * This is the one control on a phone that has to be seen
           * without being looked for — it is how a basket gets opened —
           * and in near-black brown it sat quietly against the page's
           * cream like a piece of furniture. Blinkit's is a saturated
           * green for exactly this reason; Quoin's equivalent is its own
           * accent, which carries the same weight without borrowing
           * another shop's colour.
           *
           * `rounded-full` with it: a filled bar at this size reads as a
           * pill rather than a panel, which is what keeps it feeling
           * like something that floats over the page. */
          className="flex w-full items-center gap-3 rounded-full bg-accent px-4 py-3 text-left shadow-lg transition-colors hover:bg-accent-bright"
        >
          {/* What is actually in the basket, stacked — the reference's
              arrangement, and a better answer than a cart glyph: a row
              of thumbnails says "your two tins and a brush" where an
              icon says "cart", which the button already says in words.

              Three at most. A fourth disc on a 375px pill costs the
              price its room and adds nothing: the count beside it is
              what carries "and more". */}
          {thumbs.length > 0 ? (
            <span className="flex shrink-0 -space-x-3">
              {thumbs.map((line) => (
                <span
                  key={line.id}
                  /* Ringed in the pill's own colour so the discs read as
                     overlapping rather than as one smudge — the ring is
                     the gap. */
                  /* `relative block`, and both matter.
                   *
                   * `block` because a bare `<span>` is inline, and an
                   * inline box ignores width, height and
                   * `overflow-hidden`. `relative` because `ProductImage`
                   * renders `fill` — `position: absolute; inset: 0` —
                   * and says in as many words that its container must be
                   * positioned. Without the first the photograph sat
                   * square in the middle of the pill; without the
                   * second it stretched across the whole of it. */
                  className="relative block size-9 shrink-0 overflow-hidden rounded-full bg-surface ring-2 ring-accent"
                >
                  <ProductImage
                    photo={line.snapshot.photo}
                    swatchKey={line.snapshot.image}
                    label={line.snapshot.title}
                    sizes="36px"
                    className="size-full"
                    fit="cover"
                  />
                </span>
              ))}
            </span>
          ) : (
            <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-white/20 text-on-accent">
              <Cart className="size-4.5" />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="nums block text-body font-semibold text-on-accent">
              {formatPrice(subtotalPaise)}
            </span>
            <span className="nums block text-micro text-on-accent/80">
              {count} {count === 1 ? "item" : "items"}
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-2 text-caption font-bold text-on-accent">
            View cart
            {/* The darker disc. The pill is one flat colour otherwise,
                and the thing you press is the whole pill — this gives
                the eye somewhere to land without inventing a second
                control. `black/20` rather than a palette token so the
                step is the same in either theme. */}
            <span className="grid size-8 place-items-center rounded-full bg-black/20">
              <Chevron className="size-4" />
            </span>
          </span>
        </button>
      </div>

      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
