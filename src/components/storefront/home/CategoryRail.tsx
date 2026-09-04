import Image from "next/image";
import Link from "next/link";
import { CATEGORY_PHOTOS } from "@/lib/category-photos";
import type { Category } from "@/lib/types/catalog";

/**
 * Categories, compact, on a phone.
 *
 * The tall photographic tiles are right on a desktop, where six of them
 * fill a row and the picture does the selling. On a 390px screen the same
 * six tiles are three full screens of scrolling before the customer
 * reaches a single product — so the phone gets this instead: a scrolling
 * rail of 76px thumbnails, all fourteen departments reachable with a
 * thumb, no vertical cost at all.
 *
 * Two rows rather than one. A single row of fourteen means swiping past
 * eleven to reach the last, and `grid-flow-col` with two rows halves that
 * without making the thumbnails smaller.
 *
 * The column width is viewport-relative so that half of the fifth column
 * is always visible. At a fixed 76px the four columns tile to within three
 * pixels of a 375px screen, and a rail that comes to rest looking exactly
 * like a complete grid is a rail nobody swipes.
 *
 * Both layouts are always in the DOM and swapped with CSS, so the server
 * renders one tree and nothing reflows at hydration.
 */
export function CategoryRail({ categories }: { categories: Category[] }) {
  return (
    /* Not `.rail`: that utility sets `display: flex`, and this needs a
       two-row grid flowing sideways. The scroll container and the grid are
       therefore separate elements — `w-max` on the inner one is what stops
       the grid shrinking itself to the viewport instead of overflowing it. */
    <div className="no-scrollbar overflow-x-auto overscroll-x-contain px-5">
      <div className="grid w-max grid-flow-col grid-rows-2 gap-x-3 gap-y-5">
      {categories.map((category) => {
        const photo = CATEGORY_PHOTOS[category.slug];
        return (
          <Link
            key={category.id}
            href={`/c/${category.slug}`}
            className="group flex w-[18vw] max-w-20 flex-col items-center gap-2 text-center"
          >
            <span className="relative aspect-square w-full overflow-hidden rounded-xl bg-sunk ring-1 ring-line-hair transition-transform duration-200 ease-out-quart group-active:scale-95">
              {photo && (
                <Image
                  src={photo}
                  alt=""
                  fill
                  sizes="20vw"
                  className="object-cover"
                />
              )}
            </span>
            {/* Two lines of headroom, so "Home appliances & security" does
                not make its column taller than the eleven beside it. */}
            <span className="line-clamp-2 text-micro leading-tight text-muted">
              {category.title}
            </span>
          </Link>
        );
      })}
      </div>
    </div>
  );
}
