/**
 * Core catalog domain model.
 *
 * The single most important decision in this file: Quoin sells four
 * fundamentally different things through one storefront — instantly
 * deliverable goods, area-priced materials, bookable services, and
 * made-to-order items. They cannot share a `price: number` column, and
 * they cannot share a fulfilment path. Everything downstream (cart,
 * checkout, orders) branches on `fulfilment`, so it is modelled first.
 */

/** How a listing reaches the customer. Drives cart splitting at checkout. */
export type FulfilmentType =
  /** In a dark store within the serviceable radius. The "18 minutes" promise. */
  | "instant"
  /** Real stock, but delivered on a chosen date — heavy/bulk goods. */
  | "scheduled"
  /** No stock at all. Consumes a professional's time slot. */
  | "bookable"
  /** Manufactured or cut after the order is placed. Lead time in days. */
  | "made_to_order";

/** How the price is expressed to the customer. Drives the add-to-cart UI. */
export type PricingUnit =
  | "per_piece"
  | "per_sqft"
  | "per_running_ft"
  | "per_visit"
  | "per_bag"
  | "per_litre"
  | "per_kg";

export const PRICING_UNIT_LABEL: Record<PricingUnit, string> = {
  per_piece: "Per Pc",
  per_sqft: "/sq.ft.",
  per_running_ft: "/r.ft.",
  per_visit: "Per Visit",
  per_bag: "Per Bag",
  per_litre: "Per Ltr",
  per_kg: "Per Kg",
};

/**
 * Money is stored in paise (integer) everywhere. Floating-point rupees
 * accumulate rounding errors across tier pricing, GST and promos.
 */
export type Paise = number;

/** Trust markers rendered as chips on product cards. */
export type BadgeKind =
  | "experts_verified"
  | "premium_quality"
  | "top_brand"
  | "premium_finish"
  | "bestseller";

export const BADGE_LABEL: Record<BadgeKind, string> = {
  experts_verified: "Experts Verified",
  premium_quality: "Premium Quality",
  top_brand: "Top Brand",
  premium_finish: "Premium Finish",
  bestseller: "Bestseller",
};

/**
 * A purchasable variant. Products with multiple variants display the
 * cheapest as "₹X Onwards" rather than an exact price.
 */
export interface Variant {
  id: string;
  label: string;
  /** List price before any tier or promo discount. */
  mrp: Paise;
  /** Default sell price for a non-Pro customer. */
  price: Paise;
  /** Pro-tier price. Absent means Pro pays `price`. */
  proPrice?: Paise;
  sku: string;
  /**
   * Minimum sellable quantity. Marble is not sold by the single sq.ft.,
   * cement not by the single bag.
   */
  minQty: number;
  /** Quantity increments above `minQty`. */
  stepQty: number;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  /** Manufacturer or service provider. Null for Quoin's own services. */
  brand: string | null;
  categoryId: string;
  fulfilment: FulfilmentType;
  pricingUnit: PricingUnit;
  variants: Variant[];
  badges: BadgeKind[];
  /** Swatch key for the generated stand-in. Always present. */
  image: string;
  /**
   * The best available picture: Quoin's own or generated first, then the
   * captured source photography where the deployment opts in — see
   * `SHOW_SOURCE_IMAGES`. Absent means the swatch is all there is.
   */
  photo?: string;
  /**
   * True when `photo` came from an image model. The card and the detail
   * page must say so — it is an illustration of the kind of product, not
   * a photograph of the item being sold.
   */
  photoIsIllustration?: boolean;
  /** Populated only when `fulfilment` is `made_to_order` or `scheduled`. */
  leadTimeDays?: number;
}

export interface Category {
  id: string;
  slug: string;
  title: string;
  /** Thumbnails composited into the category tile. */
  images: string[];
  /** Count of sub-categories beyond those shown — renders as "+6 more". */
  moreCount: number;
  /** Active, sellable products filed under it. */
  productCount: number;
}

/** Top-level storefront filter tabs. `all` is a pseudo-category. */
export interface CatalogTab {
  id: string;
  label: string;
  icon: string;
}

export interface Banner {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  href: string;
  /** Tailwind gradient classes; real banners will carry an image URL. */
  tone: string;
}

/** ---- Price resolution -------------------------------------------------
 * Resolution order is base → tier → promo → wallet. Kept as a pure
 * function so the same logic runs on the server at checkout and in the
 * client for optimistic cart totals — the two must never disagree.
 */

export interface PriceView {
  /** What the customer pays, per unit. */
  amount: Paise;
  /** Struck-through reference price, when there is a saving to show. */
  strikethrough: Paise | null;
  /** True when this price is only available because the customer is Pro. */
  isProPrice: boolean;
  /** True when the product has variants and this is the lowest. */
  isFrom: boolean;
}

/** Price of one specific variant. The detail page prices what is selected. */
export function resolveVariantPrice(variant: Variant, isPro: boolean): PriceView {
  const usedProPrice = isPro && variant.proPrice != null;
  const amount = usedProPrice ? variant.proPrice! : variant.price;

  return {
    amount,
    strikethrough: variant.mrp > amount ? variant.mrp : null,
    isProPrice: usedProPrice,
    isFrom: false,
  };
}

/** Price shown on a card: the cheapest variant, flagged as "Onwards". */
export function resolvePrice(product: Product, isPro: boolean): PriceView {
  const cheapest = product.variants.reduce((min, v) => {
    const effective = isPro && v.proPrice != null ? v.proPrice : v.price;
    const minEffective = isPro && min.proPrice != null ? min.proPrice : min.price;
    return effective < minEffective ? v : min;
  }, product.variants[0]);

  return {
    ...resolveVariantPrice(cheapest, isPro),
    isFrom: product.variants.length > 1,
  };
}

/** What a Pro would save on this variant, or null when there is no Pro rate. */
export function proSaving(variant: Variant): Paise | null {
  if (variant.proPrice == null) return null;
  const saving = variant.price - variant.proPrice;
  return saving > 0 ? saving : null;
}

/** Formats paise as ₹ with Indian digit grouping and no trailing decimals. */
export function formatPrice(paise: Paise): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  })}`;
}
