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
 * One light panel behind the whole row rather than a card per logo. The
 * marks are cut out on white, and after dark a fourteen-card grid put a
 * white rectangle behind every one of them — the row became boxes with
 * logos in them rather than logos. Worse, the alternative of dropping the
 * cards entirely is not open: Hettich, UltraTech, Ambuja and Mars are all
 * dark ink, and on the dark page they simply disappeared. `bg-photo`
 * exists for this exact problem — it is the ground cut-out imagery sits
 * on, and it stays near-white in both palettes.
 *
 * `flex-wrap` rather than a grid because the roster is hand-kept and its
 * length changes: a grid leaves a lone logo stranded at the start of a
 * last row, while a centred wrap keeps a short final row balanced at any
 * count.
 *
 * On a phone the wall becomes a rail of pills — see `BrandRail` below.
 */
export async function BrandWall() {
  const targets = await getBrandLinkTargets();

  return (
    <div className="hidden rounded-card border border-photo-edge bg-photo px-4 py-6 lg:block lg:rounded-2xl lg:px-8 lg:py-8">
      {/* Seven across from `lg` puts the fourteen marks in two even rows. */}
      <div className="flex flex-wrap justify-center gap-3 lg:gap-4">
        {BRAND_WALL.map(({ slug, name, logo }) => {
          const target = targets.get(brandKey(name)) ?? targets.get(slug);

          /* Sized the same whether or not it leads anywhere: a logo that
             is a link and a logo that is not should not be two different
             sizes on the same wall. */
          const cell =
            "flex basis-[calc(25%-0.5625rem)] items-center justify-center lg:basis-[calc(14.2857%-0.858rem)]";

          const plate = (
            /* Not `next/image`: the marks arrive at wildly different
               aspect ratios and are already small, so a fixed `sizes`
               would either upscale the wide ones or waste bytes on the
               square ones. */
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
                 artwork inside it exactly as the maximums would have.

                 The box is taller than the wordmarks need because
                 `object-contain` scales to whichever edge binds first:
                 wide marks like Mars stop at the cell width long before
                 they reach this height, while square ones — Ambuja,
                 Häfele — are held by it, and at a shorter height they
                 shrank to specks beside their neighbours. */
              className="h-9 w-full object-contain lg:h-12"
            />
          );

          return target ? (
            <Link
              key={slug}
              href={`/products?brand=${target}`}
              aria-label={name}
              className={`${cell} opacity-90 transition-opacity duration-200 hover:opacity-100`}
            >
              {plate}
            </Link>
          ) : (
            <div key={slug} className={cell}>
              {plate}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The same roster, as a swipeable rail, on a phone.
 *
 * Fourteen marks wrapped into a wall is four rows of tiny artwork at
 * 375px — the whole point of the wall, that it reads as one texture, is
 * lost when each row holds four specks. A rail gives every mark a pill
 * wide enough to read, and swiping past ten to reach Mars costs nothing
 * because nobody is looking for a particular one; they are checking that
 * the names they know are here.
 *
 * Each pill is the mark on the same near-white ground the wall uses,
 * for the same reason: half the roster is dark ink and would vanish
 * against the dark palette's card.
 */
export async function BrandRail() {
  const targets = await getBrandLinkTargets();

  return (
    <div className="rail gap-2.5 px-5 scroll-pl-5 lg:hidden">
      {BRAND_WALL.map(({ slug, name, logo }) => {
        const target = targets.get(brandKey(name)) ?? targets.get(slug);

        const pill =
          "grid h-14 w-32 place-items-center rounded-full border border-photo-edge bg-photo px-4";

        const plate = (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={name}
            loading="lazy"
            decoding="async"
            className="h-7 w-full object-contain"
          />
        );

        return target ? (
          <Link
            key={slug}
            href={`/products?brand=${target}`}
            aria-label={name}
            className={`${pill} transition-transform duration-200 ease-out-quart active:scale-[0.97]`}
          >
            {plate}
          </Link>
        ) : (
          <div key={slug} className={pill}>
            {plate}
          </div>
        );
      })}
    </div>
  );
}
