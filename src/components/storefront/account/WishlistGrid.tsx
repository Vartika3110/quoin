"use client";

import Link from "next/link";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductGridSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Close, Heart } from "@/components/icons";
import { useWishlist } from "@/lib/store/wishlist";
import { formatPrice } from "@/lib/types/catalog";

/**
 * Saved products.
 *
 * Renders from the snapshot taken when each was saved rather than
 * re-fetching the catalogue: a wishlist of forty items would otherwise be
 * forty requests before anything appears, and the price shown is labelled
 * as the saved one for exactly that reason — the detail page is where
 * today's price is authoritative.
 */
export function WishlistGrid() {
  const { items, ready, remove, clear } = useWishlist();
  const toast = useToast();

  if (!ready) return <ProductGridSkeleton count={4} />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="size-6" />}
        title="Save products you love"
        action={{ href: "/products", label: "Browse the catalogue" }}
        secondaryAction={{ href: "/categories", label: "Shop by category" }}
      >
        Tap the heart on any product and it waits here — useful when you are
        comparing three taps and want to decide with the site engineer later.
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="nums text-caption text-muted">
          {items.length} {items.length === 1 ? "product" : "products"}
        </p>
        <button
          type="button"
          onClick={() => {
            clear();
            toast.toast("Wishlist cleared");
          }}
          className="text-caption text-muted transition-colors hover:text-danger"
        >
          Clear all
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li
            key={item.slug}
            className="group relative overflow-hidden rounded-card border border-line-soft bg-surface transition-[border-color,box-shadow] duration-200 hover:border-line hover:shadow-md"
          >
            <Link href={`/p/${item.slug}`} className="block">
              <span className="block aspect-square overflow-hidden bg-photo">
                <ProductImage
                  photo={item.photo}
                  swatchKey={item.image}
                  label={item.title}
                  className="size-full transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
                />
              </span>
              <span className="block p-3">
                {item.brand && (
                  <span className="block truncate text-micro uppercase tracking-wide text-muted">
                    {item.brand}
                  </span>
                )}
                <span className="mt-0.5 line-clamp-2 text-body-sm leading-snug text-ink">
                  {item.title}
                </span>
                <span className="nums mt-2 block text-body font-semibold text-ink">
                  {formatPrice(item.pricePaise)}
                </span>
                <span className="mt-0.5 block text-micro text-faint">
                  Price when saved
                </span>
              </span>
            </Link>

            <button
              type="button"
              aria-label={`Remove ${item.title} from your wishlist`}
              onClick={() => {
                remove(item.slug);
                toast.toast("Removed from your wishlist");
              }}
              className="tap-target absolute right-2 top-2 grid size-8 place-items-center rounded-full border border-line-soft bg-surface/90 text-muted backdrop-blur-sm transition-colors hover:text-danger"
            >
              <Close className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      <Button href="/products" variant="outline" block className="mt-6">
        Keep browsing
      </Button>
    </div>
  );
}
