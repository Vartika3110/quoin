import Link from "next/link";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { Calendar, Chevron, Clock, Ruler, Truck } from "@/components/icons";
import {
  BADGE_LABEL,
  PRICING_UNIT_LABEL,
  formatPrice,
  resolvePrice,
  type FulfilmentType,
  type Product,
} from "@/lib/types/catalog";

/**
 * A product as a table row.
 *
 * The list view exists for the professional case: someone pricing a bill
 * of quantities needs the full name, the SKU and the unit price on one
 * line, twenty at a time — not six tiles with the name clamped to two
 * lines. It is the same product object as the card, drawn for a different
 * job.
 *
 * Server-rendered, unlike the card: there is no quick-add here, because
 * anyone working from a list is choosing variants deliberately.
 */

const FULFILMENT: Record<
  FulfilmentType,
  { label: (d?: number) => string; Icon: typeof Clock }
> = {
  instant: { label: () => "18 min", Icon: Clock },
  scheduled: { label: (d) => `${d ?? 2} days`, Icon: Truck },
  bookable: { label: () => "Book a slot", Icon: Calendar },
  made_to_order: { label: (d) => `Made to order · ${d ?? 7}d`, Icon: Ruler },
};

export function ProductRow({
  product,
  isPro = false,
}: {
  product: Product;
  isPro?: boolean;
}) {
  const price = resolvePrice(product, isPro);
  const fulfil = FULFILMENT[product.fulfilment];
  const badge = product.badges[0];
  const sku = product.variants[0]?.sku;

  return (
    <li>
      <Link
        href={`/p/${product.slug}`}
        className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-hover lg:px-3"
      >
        <span className="size-14 shrink-0 overflow-hidden rounded-lg border border-photo-edge bg-photo">
          <ProductImage
            photo={product.photo}
            swatchKey={product.image}
            label={product.title}
            className="size-full"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            {product.brand && (
              <span className="text-micro uppercase tracking-wide text-muted">
                {product.brand}
              </span>
            )}
            {sku && (
              <span className="nums text-micro text-faint">{sku}</span>
            )}
          </span>
          <span className="mt-0.5 line-clamp-1 text-body text-ink group-hover:text-accent">
            {product.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-micro text-muted">
              <fulfil.Icon className="size-3 text-accent" />
              {fulfil.label(product.leadTimeDays)}
            </span>
            {badge && (
              <Badge tone="accent" size="sm">
                {BADGE_LABEL[badge]}
              </Badge>
            )}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="nums block text-body font-semibold text-ink">
            {formatPrice(price.amount)}
          </span>
          <span className="block text-micro text-muted">
            {price.isFrom ? "onwards" : PRICING_UNIT_LABEL[product.pricingUnit]}
          </span>
          {price.strikethrough && (
            <span className="nums block text-micro text-faint line-through">
              {formatPrice(price.strikethrough)}
            </span>
          )}
        </span>

        <Chevron className="hidden size-4 shrink-0 text-faint sm:block" />
      </Link>
    </li>
  );
}
