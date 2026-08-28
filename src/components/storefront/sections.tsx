import Link from "next/link";
import { Swatch } from "@/components/Swatch";
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

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="rail gap-3 px-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/c/${c.slug}`}
          className="relative flex h-52 w-56 flex-col justify-between overflow-hidden rounded-card border border-line-soft bg-surface p-4 transition-colors hover:border-line lg:h-48 lg:w-auto"
        >
          <h3 className="max-w-[70%] text-base font-medium leading-snug text-ink">
            {c.title}
          </h3>

          {/* Thumbnails overlap toward the lower-right, as in the reference. */}
          <div className="pointer-events-none absolute bottom-3 right-3 flex items-end">
            {c.images.map((img, i) => (
              <span
                key={img}
                className="overflow-hidden rounded-lg border border-line-soft"
                style={{ marginLeft: i === 0 ? 0 : -14, zIndex: i }}
              >
                <Swatch swatchKey={img} label="" className="size-16" />
              </span>
            ))}
          </div>

          {/* "+0 more" says nothing. Until the category tree is populated
              there are no sub-categories to count, so the tile shows what
              it actually holds. */}
          {/* "+0 more" says nothing. Until the category tree is populated
              there are no sub-categories to count, so the tile shows what
              it actually holds. */}
          <span className="w-fit rounded-full bg-accent-wash px-2.5 py-1 text-[11px] text-accent">
            {c.moreCount > 0
              ? `+${c.moreCount} more`
              : `${c.productCount} ${c.productCount === 1 ? "product" : "products"}`}
          </span>
        </Link>
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
