import Image from "next/image";
import Link from "next/link";
import { Chevron } from "@/components/icons";
import { BRAND_WALL } from "@/lib/brand-logos";

/**
 * The manufacturer, as a way through to the rest of their range.
 *
 * Somebody looking at one Jaquar mixer is often deciding between Jaquar
 * mixers, and until now the only route to the rest of them was the small
 * uppercase line above the title — which reads as a label, because that
 * is what an eyebrow is. This is the same destination made to look like
 * a door.
 *
 * The mark is shown only when Quoin actually holds the file: `BRAND_WALL`
 * is an explicit list, not a guess at `/brands/${slug}.png`, because a
 * logo is a trademark and showing one is a claim about a relationship —
 * and because the importer invents brands (`Generic`, `Local`) that will
 * never have a file. A brand with no mark on the wall gets its initial
 * instead, which is a typographic stand-in rather than a broken image.
 */
export function BrandCard({ brand }: { brand: string }) {
  const mark = BRAND_WALL.find((b) => squash(b.name) === squash(brand));

  return (
    <Link
      href={`/products?brand=${brandSlug(brand)}`}
      className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-hover"
    >
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-line-hair bg-raised">
        {mark ? (
          <Image
            src={mark.logo}
            alt=""
            width={44}
            height={44}
            className="size-full object-contain p-1"
          />
        ) : (
          <span aria-hidden className="font-display text-title-sm text-muted">
            {brand.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold text-ink">
          {brand}
        </span>
        <span className="block text-caption text-muted">
          Explore all products
        </span>
      </span>

      <Chevron className="size-4 shrink-0 text-faint" />
    </Link>
  );
}

/**
 * The brand as it appears in `?brand=`.
 *
 * `Brand.slug` is what the listing filters on and the storefront
 * `Product` type carries only the name, so the name is slugified the same
 * way the importer does. Exact for every brand in the catalogue today,
 * and if it ever stops being, the listing returns everything — a harmless
 * failure. **Not** `brandKey` from the data layer, which squashes
 * punctuation without a separator: that gives `asianpaints`, the listing
 * matches nothing, and the card leads to an empty shelf.
 */
function brandSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * For matching a name against the wall, where `Häfele` has to find
 * `hafele`. Separator-free and accent-blind on purpose — this one never
 * becomes a URL.
 */
function squash(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
