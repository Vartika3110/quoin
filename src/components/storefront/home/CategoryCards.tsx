import Image from "next/image";
import Link from "next/link";
import { Chevron } from "@/components/icons";
import { CATEGORY_PHOTOS } from "@/lib/category-photos";
import { formatPrice } from "@/lib/types/catalog";
import type { Category } from "@/lib/types/catalog";

/**
 * Departments, as cards with a price on them.
 *
 * The difference between this and a department rail is the question it
 * answers. A rail of thumbnails answers "what do you sell"; a card that
 * says *From ₹380* answers "can I afford to start", which is the
 * question someone opens a materials app with.
 *
 * The caller decides how many. It has been four, then all fourteen, and
 * is currently eight — two-up rows 56px tall, so eight is four rows and
 * a block a reader takes in at once rather than scrolls past.
 *
 * The floor is the cheapest active variant in the department, computed in
 * one grouped query rather than per card — see `getCategoryPriceFloors`.
 * Where a department has no priced variant yet the card falls back to its
 * product count, because "From ₹0" on a catalogue that is still being
 * priced is worse than saying nothing about price at all.
 *
 * Phone only. From `lg` the same departments are already in the
 * photographic tile grid, at a size where the picture does the selling.
 */
export function CategoryCards({
  categories,
  priceFloors,
}: {
  categories: Category[];
  priceFloors: Map<string, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 px-5 lg:hidden">
      {categories.map((category) => {
        const floor = priceFloors.get(category.id);
        const photo = CATEGORY_PHOTOS[category.slug];

        return (
          <Link
            key={category.id}
            href={`/c/${category.slug}`}
            className="flex items-center gap-2.5 rounded-card border border-line-soft bg-surface p-2.5 transition-transform duration-200 ease-out-quart active:scale-[0.98]"
          >
            <span className="relative size-13 shrink-0 overflow-hidden rounded-xl bg-sunk">
              {photo && (
                <Image
                  src={photo}
                  alt=""
                  fill
                  sizes="52px"
                  className="object-cover"
                />
              )}
            </span>

            <span className="min-w-0 flex-1">
              {/* Two lines of headroom so "Home appliances & security" does
                  not make its card taller than the one beside it. */}
              <span className="line-clamp-2 text-caption font-bold leading-tight text-ink">
                {category.title}
              </span>
              <span className="mt-1 flex items-center gap-0.5 text-caption font-bold text-accent">
                <span className="nums truncate">
                  {floor != null
                    ? `From ${formatPrice(floor)}`
                    : `${category.productCount} products`}
                </span>
                <Chevron className="size-3 shrink-0" />
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
