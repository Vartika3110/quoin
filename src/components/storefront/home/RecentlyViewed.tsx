"use client";

import Link from "next/link";
import { ProductImage } from "@/components/storefront/ProductImage";
import { SectionHead } from "@/components/ui/Section";
import { useRecentlyViewed } from "@/lib/store/recently-viewed";
import { formatPrice } from "@/lib/types/catalog";

/**
 * Where you were.
 *
 * Renders nothing at all until there is something to show — no heading, no
 * empty state, no reserved space. A "Recently viewed" heading over an
 * empty rail on a first visit is a section that exists to explain itself,
 * and the whole value here is that it silently appears on the second
 * visit and is exactly what the customer wanted.
 *
 * Deliberately lighter than a product card: a thumbnail, a name and a
 * price. Someone returning to a product they have already read does not
 * need the delivery chip, the badge and the add button again — they need
 * to find it in one glance.
 */
export function RecentlyViewed() {
  const { items, ready } = useRecentlyViewed();

  if (!ready || items.length === 0) return null;

  return (
    <section>
      <SectionHead title="Where you left off" />
      <div className="rail gap-3 px-5 scroll-pl-5 lg:px-0 lg:scroll-pl-0">
        {items.map((item) => (
          <Link
            key={item.slug}
            href={`/p/${item.slug}`}
            className="group w-32 shrink-0"
          >
            <span className="block aspect-square overflow-hidden rounded-card border border-photo-edge bg-photo">
              <ProductImage
                photo={item.photo}
                swatchKey={item.image}
                label={item.title}
                className="size-full transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
              />
            </span>
            <span className="mt-2 block line-clamp-2 text-micro leading-snug text-muted">
              {item.title}
            </span>
            <span className="nums mt-1 block text-caption font-semibold text-ink">
              {formatPrice(item.pricePaise)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
