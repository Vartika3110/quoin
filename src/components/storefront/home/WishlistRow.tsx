"use client";

import Link from "next/link";
import { Chevron, HeartFilled } from "@/components/icons";
import { ProductImage } from "@/components/storefront/ProductImage";
import { SectionHead } from "@/components/ui/Section";
import { useWishlist } from "@/lib/store/wishlist";
import { formatPrice } from "@/lib/types/catalog";

/**
 * What the reader has hearted, at the top of the home page.
 *
 * **Renders nothing until there is something in it**, which is most
 * visits and every first one. A section that announces an empty wishlist
 * teaches a reader to scroll past that part of the page before they have
 * ever used it.
 *
 * Client-side because the wishlist is: signed in it comes from the
 * account, signed out from this browser, and the page itself is rendered
 * before either is known. The row simply appears when the store is ready
 * and has something — no skeleton, because a placeholder for a section
 * that usually does not exist is worse than the section arriving late.
 *
 * A rail, not a grid. This is a reminder of a decision already made,
 * which deserves a glance rather than a screen; the whole list is one tap
 * away and says so.
 */
export function WishlistRow() {
  const { items, ready } = useWishlist();

  if (!ready || items.length === 0) return null;

  return (
    <section>
      <SectionHead
        title="Your wishlist"
        subtitle="Hearted, with today's price."
        href="/account/wishlist"
        linkLabel="See all"
      />

      <div className="rail gap-3 px-5 pb-1 scroll-pl-5 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-6">
        {items.slice(0, 6).map((item) => (
          <Link
            key={item.slug}
            href={`/p/${item.slug}`}
            className="group w-36 shrink-0 lg:w-auto"
          >
            <div className="relative aspect-square overflow-hidden rounded-card border border-photo-edge bg-photo">
              <ProductImage
                photo={item.photo}
                swatchKey={item.image}
                label={item.title}
                brand={item.brand}
                sizes="(min-width: 1024px) 160px, 144px"
                className="size-full transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
              />
              {/* Filled, always. Everything in this row is hearted by
                  definition, so an outline would be the one state it can
                  never be in. */}
              <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-surface/90 text-accent shadow-xs">
                <HeartFilled className="size-3.5" />
              </span>
            </div>

            <p className="mt-2 line-clamp-2 text-caption leading-snug text-ink">
              {item.title}
            </p>
            <p className="nums mt-0.5 text-body-sm font-semibold text-ink">
              {formatPrice(item.pricePaise)}
            </p>
          </Link>
        ))}

        {items.length > 6 && (
          <Link
            href="/account/wishlist"
            className="flex w-36 shrink-0 flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line text-caption font-medium text-muted transition-colors hover:border-accent hover:text-accent lg:w-auto"
          >
            <Chevron className="size-5" />
            {items.length - 6} more
          </Link>
        )}
      </div>
    </section>
  );
}
