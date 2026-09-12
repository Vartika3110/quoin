"use client";

import Link from "next/link";
import { Cart, Chevron, Crown } from "@/components/icons";
import { useCart } from "@/lib/store/cart";

/**
 * The Pro pitch and the basket, sharing a row.
 *
 * Phone only, and deliberately a pair rather than two bands: on a phone
 * the full-width Pro promo below is a screen of its own, and this is the
 * version of it that a reader passes rather than stops at.
 *
 * The cart tile is the third place the basket appears — after the header
 * pill and the floating bar — which is one more than a storefront
 * normally wants. It earns the spot because the other two are *chrome*:
 * they are how you check the basket while shopping, and this is how you
 * find it again having scrolled to the bottom of the home page. It shows
 * the count rather than the total on purpose, so the two readings are not
 * competing for the same glance.
 */
export function ProAndCart() {
  const { count, ready } = useCart();

  return (
    <div className="grid grid-cols-2 gap-2.5 px-5 lg:hidden">
      <Link
        href="/pro"
        className="flex min-h-24 flex-col justify-between gap-3 rounded-card bg-deep p-3.5 transition-colors active:bg-deep-soft"
      >
        <Crown className="size-4.5 text-pro" />
        <span>
          <span className="block text-caption font-bold leading-tight text-on-deep">
            Unlock professional benefits
          </span>
          <span className="mt-0.5 block text-[10px] leading-snug text-on-deep/65">
            Trade pricing and priority dispatch
          </span>
        </span>
      </Link>

      <Link
        href="/cart"
        className="flex min-h-24 flex-col justify-between gap-3 rounded-card border border-line-soft bg-surface p-3.5 transition-colors active:bg-hover"
      >
        <Cart className="size-4.5 text-accent" />
        <span className="flex items-end justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-body-sm font-bold leading-tight text-ink">
              Cart
            </span>
            {/* `ready` is false until the basket has been read out of
                storage; rendering "0 items" before then tells someone
                with a full basket that it is empty. */}
            <span className="nums mt-0.5 block text-[10px] text-muted">
              {ready ? `${count} ${count === 1 ? "item" : "items"}` : " "}
            </span>
          </span>
          <Chevron className="size-4 shrink-0 text-muted" />
        </span>
      </Link>
    </div>
  );
}
