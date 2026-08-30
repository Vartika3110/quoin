import Link from "next/link";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Calendar, Clock, Heart, Ruler, Truck } from "@/components/icons";
import {
  BADGE_LABEL,
  PRICING_UNIT_LABEL,
  formatPrice,
  resolvePrice,
  type FulfilmentType,
  type Product,
} from "@/lib/types/catalog";

/**
 * Fulfilment is surfaced on the card, not hidden until checkout.
 *
 * The header promises 18 minutes; three of the four fulfilment types
 * cannot honour that. Showing the real promise per card is the single
 * cheapest way to stop the cart from becoming an argument.
 */
const FULFILMENT: Record<
  FulfilmentType,
  { label: (d?: number) => string; Icon: typeof Clock }
> = {
  instant: { label: () => "18 min", Icon: Clock },
  scheduled: { label: (d) => `In ${d ?? 2} days`, Icon: Truck },
  bookable: { label: () => "Book a slot", Icon: Calendar },
  made_to_order: { label: (d) => `Made to order · ${d ?? 7}d`, Icon: Ruler },
};

export function ProductCard({
  product,
  isPro = false,
  fill = false,
}: {
  product: Product;
  isPro?: boolean;
  /**
   * `false` (the default) is the horizontal rail: a flex child that must
   * carry its own width, because `.rail > *` refuses to shrink.
   *
   * `true` is the two-column grid on the browse pages, where the column
   * already sets the width. A fixed 168px there overflows the column on a
   * 320px phone — two 168px cards plus the gap need 348px and the padded
   * content box is 280px — and pushes the whole page sideways.
   */
  fill?: boolean;
}) {
  const price = resolvePrice(product, isPro);
  const badge = product.badges[0];
  const fulfil = FULFILMENT[product.fulfilment];

  /* Only when there is a real saving. The catalogue import sets MRP equal
     to the sell price, so this stays hidden until someone prices a
     discount — a permanent "0% OFF" flash is worse than none. */
  const off = price.strikethrough
    ? Math.round(((price.strikethrough - price.amount) / price.strikethrough) * 100)
    : 0;

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-card border border-line-soft bg-surface transition-colors hover:border-line lg:w-auto ${
        fill ? "w-full" : "w-[168px]"
      }`}
    >
      <div className="relative aspect-square overflow-hidden bg-raised">
        <Link href={`/p/${product.slug}`} className="block size-full">
          <ProductImage
            photo={product.photo}
            swatchKey={product.image}
            label={product.title}
            className="size-full transition-transform duration-300 group-hover:scale-[1.03]"
          />
          {product.photoIsIllustration && (
            /* Says what the picture is. A generated image of a real SKU
               shown without this is a claim about goods the customer will
               receive that nobody has photographed. */
            <span className="absolute inset-x-0 bottom-0 bg-deep/75 px-2 py-1 text-center text-[9px] leading-tight text-white backdrop-blur-sm">
              Illustration · actual product may vary
            </span>
          )}
        </Link>
        {off > 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-accent px-1.5 py-1 text-[10px] font-semibold leading-none text-white">
            {off}% OFF
          </span>
        )}

        <button
          aria-label={`Save ${product.title}`}
          /* `tap-target`: 32px is the drawn size the card is built around,
             so the touch area is grown to 44px behind it instead. */
          className="tap-target absolute right-2 top-2 grid size-8 place-items-center rounded-full border border-line-soft bg-surface/90 text-muted backdrop-blur-sm hover:text-accent"
        >
          <Heart className="size-4" />
        </button>

        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md border border-line-soft bg-surface/90 px-1.5 py-1 text-[10px] text-ink backdrop-blur-sm">
          <fulfil.Icon className="size-3 text-accent" />
          {fulfil.label(product.leadTimeDays)}
        </span>
      </div>

      <Link href={`/p/${product.slug}`} className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-base font-semibold text-accent">
            {formatPrice(price.amount)}
          </span>
          <span className="text-[11px] text-muted">
            {price.isFrom ? "Onwards" : PRICING_UNIT_LABEL[product.pricingUnit]}
          </span>
          {price.strikethrough && (
            <span className="text-[11px] text-faint line-through">
              {formatPrice(price.strikethrough)}
            </span>
          )}
        </div>

        {/* Clamped, not shortened. A Jaquar name carries its range, its
            fitting and often a model code, which runs past ninety
            characters and would push the price off a tile — but the whole
            name is what the customer needs on the detail page, and what
            they hover to read here. */}
        <h3 className="line-clamp-3 text-sm leading-snug text-ink" title={product.title}>
          {product.title}
        </h3>

        {badge && (
          <span className="mt-auto w-fit rounded-md bg-accent-wash px-2 py-1 text-[10px] text-accent">
            {BADGE_LABEL[badge]}
          </span>
        )}
      </Link>
    </article>
  );
}
