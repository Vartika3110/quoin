"use client";

import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { Cart, Wallet } from "@/components/icons";
import { useCart } from "@/lib/store/cart";
import { formatPrice, type Paise } from "@/lib/types/catalog";

/**
 * The two figures at the head of the account: what Quoin owes the
 * customer, and what the customer is about to order.
 *
 * Wallet is server data (`User.walletPaise`) and renders immediately.
 * The cart total does not — it lives in `localStorage` like the rest of
 * the basket — so this is a client component and the cart tile alone
 * shows a skeleton until `ready`, rather than flashing "0 items" over a
 * basket that already has something in it.
 */
export function AccountStats({ walletPaise }: { walletPaise: Paise }) {
  const { count, ready } = useCart();

  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat
        label="Wallet"
        value={formatPrice(walletPaise)}
        icon={<Wallet className="size-4" />}
        href="/account/payments"
      />
      {ready ? (
        <Stat
          label="Items in cart"
          value={count}
          icon={<Cart className="size-4" />}
          href="/cart"
          hint={count === 0 ? "Basket is empty" : undefined}
        />
      ) : (
        <div className="rounded-card border border-line-soft bg-surface p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-6 w-10" />
        </div>
      )}
    </div>
  );
}
