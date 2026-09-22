"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Heart } from "@/components/icons";
import { plural } from "@/lib/account/greeting";
import { DashboardCardHead } from "@/components/storefront/account/dashboard/DashboardCardHead";
import { useWishlist } from "@/lib/store/wishlist";

/**
 * Saved products — the one dashboard card whose count lives only in this
 * browser (see `docs/design-system.md`, "Client state"). Server-rendering
 * a count here would show zero to everyone and correct it after
 * hydration, so the whole card waits for `ready` and shows the shape of
 * itself instead of a wrong number for one frame.
 */
export function SavedCard() {
  const { count, ready } = useWishlist();

  if (!ready) {
    return (
      <Card padding="lg" className="anim-rise flex h-full flex-col">
        <DashboardCardHead icon={<Heart className="size-4.5" />} title="Saved" />
        <Skeleton className="mt-4 h-5 w-32" />
        <Skeleton className="mt-3 h-9 w-28 rounded-lg" />
      </Card>
    );
  }

  return (
    <Card padding="lg" className="anim-rise flex h-full flex-col">
      <DashboardCardHead icon={<Heart className="size-4.5" />} title="Saved" />

      {count === 0 ? (
        <>
          <p className="mt-3 flex-1 text-body-sm leading-relaxed text-muted">
            Save products you want to come back to.
          </p>
          <Button href="/products" variant="outline" size="sm" className="mt-4 self-start">
            Explore Products
          </Button>
        </>
      ) : (
        <>
          <p className="nums mt-3 flex-1 text-title-sm font-semibold text-ink">
            {count} {plural(count, "Saved Product", "Saved Products")}
          </p>
          <Button href="/account/wishlist" variant="outline" size="sm" className="mt-4 self-start">
            View Saved
          </Button>
        </>
      )}
    </Card>
  );
}
