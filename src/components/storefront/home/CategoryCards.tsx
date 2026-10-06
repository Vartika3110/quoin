import Image from "next/image";
import Link from "next/link";
import { Chevron } from "@/components/icons";
import { CATEGORY_PHOTOS } from "@/lib/category-photos";
import { formatPrice } from "@/lib/types/catalog";
import type { Category } from "@/lib/types/catalog";

/**
 * Every department, as cards with a price on them.
 *
 * It showed four for a while, on the argument that "can I afford to
 * start" stops being an answer and becomes a price list once it is asked
 * too many times. The owner wants the full set, and the shape holds it:
 * these are two-up rows 56px tall, so fourteen of them is a block a
 * reader scans rather than a page they have to scroll past, and it
 * removes the question of why four particular departments were the ones
 * on the home page.
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
