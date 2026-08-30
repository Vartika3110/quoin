import Image from "next/image";
import Link from "next/link";
import { Swatch } from "@/components/Swatch";
import { CATEGORY_PHOTOS } from "@/lib/category-photos";
import { Chevron, Grid, Sparkle } from "@/components/icons";
import type { Category } from "@/lib/types/catalog";

/** Section heading. Sits flush with the content gutter on both layouts. */
export function SectionHead({
  title,
  href,
}: {
  title: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 px-5 lg:px-0">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {href && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-0.5 text-xs text-gold hover:text-gold-bright"
        >
          See all
          <Chevron className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

/**
 * A category, as one photograph.
 *
 * The picture is the card rather than something sitting inside it. Every
 * earlier arrangement — a bordered thumbnail, then a faded one, then one
 * bled to the card's edges — kept a step where the photograph's own ground
 * met the white surface, because these are shot on grey tile and concrete
 * and counter-top, and no amount of edge treatment makes a grey rectangle
 * stop reading as a rectangle on white. Filling the card removes the
 * boundary rather than disguising it: there is no second surface left to
 * step against.
 *
 * The cost is that the type now sits on the photograph, which is why the
 * scrim below is not optional.
 */
export function CategoryTile({
  category,
  caption,
}: {
  category: Category;
  caption: string;
}) {
  const photo = CATEGORY_PHOTOS[category.slug];

  return (
    <Link
      href={`/c/${category.slug}`}
      className="group relative flex aspect-[4/5] w-44 shrink-0 flex-col justify-end overflow-hidden rounded-card lg:w-auto"
    >
      {photo ? (
        <Image
          src={photo}
          /* Decorative: the heading below is inside this same link and
             already names the category. */
          alt=""
          fill
          sizes="(min-width: 1280px) 300px, (min-width: 1024px) 240px, 176px"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        /* Still reachable: a category added after the shoot has no file,
           and the swatch already fills its box the same way a cover-fitted
           photograph does. */
        <Swatch
          swatchKey={category.images[0] ?? "cement"}
          label=""
          className="absolute inset-0 size-full"
        />
      )}

      {/* Espresso rather than black: a neutral scrim over warm photography
          greys it, and the palette is deliberately warm everywhere else.
          Tall enough to cover both lines of type at their longest — a scrim
          sized to the short titles leaves "Home appliances & security"
          sitting half on bare photograph. */}
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-deep via-deep/60 to-transparent" />

      <div className="relative p-3">
        <h3 className="text-sm font-medium leading-snug text-white">
          {category.title}
        </h3>
        <span className="mt-1 flex items-center gap-1 text-[11px] text-white/80">
          {caption}
          <Chevron className="size-3" />
        </span>
      </div>
    </Link>
  );
}

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="rail gap-3 px-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
      {categories.map((c) => (
        <CategoryTile
          key={c.id}
          category={c}
          /* "+0 more" says nothing. Until the category tree is populated
             there are no sub-categories to count, so this shows what the
             category actually holds. */
          caption={
            c.moreCount > 0
              ? `+${c.moreCount} more`
              : `${c.productCount} ${c.productCount === 1 ? "product" : "products"}`
          }
        />
      ))}
    </div>
  );
}

/** Full-width row link, used under the category and product sections. */
export function WideLink({
  href,
  label,
  icon = "grid",
}: {
  href: string;
  label: string;
  icon?: "grid" | "sparkle";
}) {
  const Icon = icon === "sparkle" ? Sparkle : Grid;
  return (
    <div className="px-5 lg:px-0">
      <Link
        href={href}
        className="flex items-center justify-center gap-2 rounded-card border border-line-soft bg-surface py-3.5 text-sm text-ink transition-colors hover:bg-hover"
      >
        <Icon className="size-4 text-gold" />
        {label}
        <Chevron className="size-4 text-muted" />
      </Link>
    </div>
  );
}
