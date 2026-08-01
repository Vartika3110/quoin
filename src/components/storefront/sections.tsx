import Link from "next/link";
import { Swatch } from "@/components/Swatch";
import { Cart, Chevron, Crown, Grid, Sparkle } from "@/components/icons";
import type { Banner, Category } from "@/lib/types/catalog";

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

export function BannerRail({ banners }: { banners: Banner[] }) {
  return (
    <div className="rail gap-3 px-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
      {banners.map((b) => (
        <Link
          key={b.id}
          href={b.href}
          className={`relative flex h-60 w-44 flex-col overflow-hidden rounded-card border border-line-soft bg-gradient-to-br p-4 lg:h-56 lg:w-auto ${b.tone}`}
        >
          <span className="w-fit rounded-md bg-black/50 px-2 py-1 text-[10px] text-ink backdrop-blur-sm">
            {b.eyebrow}
          </span>
          <h3 className="mt-4 text-xl font-semibold leading-tight text-ink">
            {b.title}
          </h3>
          <p className="mt-1 text-xs leading-snug text-white/70">{b.subtitle}</p>
          <span className="mt-auto flex items-center gap-1 text-xs text-gold">
            Explore
            <Chevron className="size-3.5" />
          </span>
        </Link>
      ))}
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
                className="overflow-hidden rounded-lg border border-white/10"
                style={{ marginLeft: i === 0 ? 0 : -14, zIndex: i }}
              >
                <Swatch swatchKey={img} label="" className="size-16" />
              </span>
            ))}
          </div>

          <span className="w-fit rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-muted backdrop-blur-sm">
            +{c.moreCount} more
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

/**
 * Pro upsell and cart summary.
 *
 * On mobile these share a row exactly as in the reference. On desktop the
 * cart lives permanently in the top bar, so only the Pro pitch remains
 * and it stretches to full width.
 */
export function ProAndCart({ cartCount }: { cartCount: number }) {
  return (
    <div className="flex gap-3 px-5 lg:px-0">
      <Link
        href="/pro"
        className="flex flex-1 items-center gap-3 rounded-card border border-gold-edge bg-gold-wash p-3.5 transition-colors hover:bg-gold-wash/70"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold-edge text-gold">
          <Crown className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-snug text-ink">
            Unlock professional benefits
          </span>
          <span className="block text-[10px] leading-snug text-muted">
            Join Quoin Pro for exclusive pricing &amp; dedicated support
          </span>
        </span>
        <Chevron className="size-4 shrink-0 text-gold" />
      </Link>

      <Link
        href="/cart"
        className="flex w-24 shrink-0 flex-col justify-center gap-0.5 rounded-card border border-line bg-surface p-3 transition-colors hover:bg-hover lg:hidden"
      >
        <Cart className="size-5 text-gold" />
        <span className="text-[13px] text-ink">Cart</span>
        <span className="text-[10px] text-muted">{cartCount} items</span>
      </Link>
    </div>
  );
}
