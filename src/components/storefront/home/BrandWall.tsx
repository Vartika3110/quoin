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
 * **Grey, at one height, until you point at one.** Fourteen logos in
 * fourteen brand colours is fourteen things competing with the page —
 * Dorset's purple, Ozone's blue, Berger's red — and a row of marks set at
 * whatever height each one happens to want reads as a clip-art collage.
 * Desaturating them makes the row one texture, which is how a logo wall
 * is actually read, and colour returning on hover confirms the mark is a
 * link without a second affordance. `grayscale` is a filter, not an
 * edit: the artwork on disk is untouched and a brand that objects is one
 * class away from being exempt.
 *
 * On a phone the wall becomes an auto-scrolling marquee — see
 * `BrandRail` below.
 */
export async function BrandWall() {
  const targets = await getBrandLinkTargets();

  return (
    /* One content card behind the whole row, not a card per logo: the
       marks are cut out on white, and after dark a fourteen-card grid put
       a white rectangle behind every one of them — the row became boxes
       with logos in them rather than logos. `bg-photo` exists for exactly
       this and stays near-white in both palettes. */
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

                 26px for every mark, which is the uniform height the
                 brief asks for and the reason the row reads as one line
                 rather than as logos of assorted importance.
                 `object-contain` letterboxes inside it: wide marks stop
                 at the cell width long before they reach the height,
                 square ones are held by it. */
              className="h-[26px] w-full object-contain grayscale transition-[filter,opacity] duration-200 group-hover/logo:grayscale-0"
            />
          );

          return target ? (
            <Link
              key={slug}
              href={`/products?brand=${target}`}
              aria-label={name}
              className={`${cell} group/logo opacity-80 transition-opacity duration-200 hover:opacity-100`}
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
 * The same roster, moving, on a phone.
 *
 * Fourteen marks wrapped into a wall is four rows of tiny artwork at
 * 375px — the whole point of the wall, that it reads as one texture, is
 * lost when each row holds four specks. A rail solved that and left the
 * last four brands behind a swipe nobody performs, which for a roster
 * whose job is "the names you know are here" is the same as not showing
 * them.
 *
 * So it scrolls itself. The track is rendered twice and translated by
 * half its width — see `.marquee` in `globals.css` for why that is what
 * makes the loop seamless — and the second copy is `aria-hidden`, so a
 * screen reader is read fourteen brands and not twenty-eight. It pauses
 * under a finger, and `prefers-reduced-motion` turns it back into the
 * hand-scrolled rail it was.
 *
 * Each mark sits on the same near-white ground the wall uses, for the
 * same reason: half the roster is dark ink and would vanish against the
 * dark palette's card. Grey, like the wall, so the two agree.
 */
export async function BrandRail() {
  const targets = await getBrandLinkTargets();

  const track = (hidden: boolean) => (
    <div
      className="flex shrink-0 items-center gap-2.5 pr-2.5"
      aria-hidden={hidden || undefined}
    >
      {BRAND_WALL.map(({ slug, name, logo }) => {
        const target = targets.get(brandKey(name)) ?? targets.get(slug);

        const pill =
          "grid h-14 w-32 shrink-0 place-items-center rounded-full border border-photo-edge bg-photo px-4";

        const plate = (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={hidden ? "" : name}
            loading="lazy"
            decoding="async"
            className="h-[26px] w-full object-contain grayscale"
          />
        );

        return target && !hidden ? (
          <Link
            key={slug}
            href={`/products?brand=${target}`}
            aria-label={name}
            className={`${pill} transition-transform duration-200 ease-out-quart active:scale-[0.97]`}
          >
            {plate}
          </Link>
        ) : (
          <div key={`${slug}${hidden ? "-copy" : ""}`} className={pill}>
            {plate}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="marquee px-5 lg:hidden">
      <div className="marquee-track">
        {track(false)}
        {track(true)}
      </div>
    </div>
  );
}
