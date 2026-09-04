import Link from "next/link";
import { BRAND_WALL } from "@/lib/brand-logos";
import { brandKey, getBrandLinkTargets } from "@/lib/data/catalog";

/**
 * The manufacturers we stock, as their own marks.
 *
 * Artwork only — no names set in type. A wall of logos is read as a
 * single texture rather than item by item, and a stray text plate among
 * them reads as a missing image, so a brand without supplied artwork is
 * left off the roster entirely instead of being written out.
 *
 * `flex-wrap` rather than a grid because the roster is hand-kept and its
 * length changes: a grid leaves a lone plate stranded at the start of a
 * last row, while a centred wrap keeps a short final row balanced at any
 * count.
 */
export async function BrandWall() {
  const targets = await getBrandLinkTargets();

  return (
    <div className="flex flex-wrap justify-center gap-2 px-5 lg:gap-3 lg:px-0">
      {BRAND_WALL.map(({ slug, name, logo }) => {
        const target = targets.get(brandKey(name)) ?? targets.get(slug);

        /* One plate, drawn the same whether or not it leads anywhere:
           a logo that is a link and a logo that is not should not be
           two different sizes on the same wall. */
        const plate = (
          /* Not `next/image`: the marks arrive at wildly different aspect
             ratios and are already small, so a fixed `sizes` would either
             upscale the wide ones or waste bytes on the square ones. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={name}
            loading="lazy"
            decoding="async"
            /* A definite box rather than `max-h`/`max-w`: sized only by
               maximums, a lazy image occupies nothing until it decodes
               and then snaps to size, so a wall of fourteen of them
               settles in fourteen visible steps. Reserving the box up
               front costs nothing and `object-contain` letterboxes the
               artwork inside it exactly as the maximums would have. */
            className="h-9 w-full object-contain lg:h-10"
          />
        );

        const shell =
          "flex h-20 basis-[calc(33.333%-0.334rem)] items-center justify-center rounded-lg border border-line-soft bg-surface px-3 py-2 sm:basis-[calc(25%-0.375rem)] lg:h-24 lg:basis-[calc(16.666%-0.625rem)] lg:px-4";

        return target ? (
          <Link
            key={slug}
            href={`/products?brand=${target}`}
            aria-label={name}
            className={`${shell} transition-[border-color,box-shadow] duration-200 hover:border-line hover:shadow-xs`}
          >
            {plate}
          </Link>
        ) : (
          <div key={slug} className={shell}>
            {plate}
          </div>
        );
      })}
    </div>
  );
}
