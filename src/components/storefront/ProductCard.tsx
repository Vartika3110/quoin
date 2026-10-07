"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/Toast";
import {
  Calendar,
  Check,
  Clock,
  Heart,
  HeartFilled,
  Minus,
  Plus,
  Ruler,
  Trash,
  Truck,
} from "@/components/icons";
import { useCart } from "@/lib/store/cart";
import { useWishlist } from "@/lib/store/wishlist";
import {
  BADGE_LABEL,
  PRICING_UNIT_LABEL,
  formatPrice,
  resolvePrice,
  type FulfilmentType,
  type Product,
} from "@/lib/types/catalog";

/**
 * The commerce card.
 *
 * **It is not a box.** The border, the surface fill and the lift-on-hover
 * are gone, and the photo plate is the only drawn edge. A bordered card
 * spends roughly 24px of every tile on chrome — two hairlines, 12px of
 * padding each side — which on a 375px screen is a tenth of the grid
 * given over to saying "these are separate things", something the gutter
 * and the photo plate already say. Taking it back is most of a third
 * row of products above the fold, and it is how every catalogue app on a
 * phone draws a grid.
 *
 * The plate keeps `photo-edge` around it, because catalogue imagery is
 * cut out on white and a white square on the cream ground needs a
 * hairline or it floats.
 *
 * Fulfilment is surfaced here, not hidden until checkout. The hero
 * promises 18 minutes; three of the four fulfilment types cannot honour
 * that, and showing each card's real promise is the single cheapest way to
 * stop the cart becoming an argument at the door.
 *
 * Two things this card deliberately does **not** show:
 *
 *  - **A rating**, unless one exists. There is no review data, and an
 *    empty five-star row on 3,000 products reads as zero out of five. The
 *    slot is wired and renders nothing until it has something to render.
 *  - **A discount flash**, unless the sell price is genuinely below MRP.
 *    Both catalogue imports set the two equal, so a permanent "0% OFF"
 *    would be on every card in the grid.
 *
 * Quick add is a real add for single-variant products and a link to the
 * detail page for everything else. Guessing a variant — a pack size, a
 * finish, a length — and putting it in someone's cart is worse than one
 * more tap.
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

export function ProductCard({
  product,
  isPro = false,
  fill = false,
  /** Rating average, when the product has one. Today: nothing does. */
  rating,
  ratingCount,
}: {
  product: Product;
  isPro?: boolean;
  /**
   * `false` (the default) is the horizontal rail: a flex child that must
   * carry its own width, because `.rail > *` refuses to shrink.
   *
   * `true` is the grid on the browse pages, where the column already sets
   * the width. A fixed 168px there overflows the column on a 320px phone
   * and pushes the whole page sideways.
   */
  fill?: boolean;
  rating?: number | null;
  ratingCount?: number;
}) {
  const price = resolvePrice(product, isPro);
  const badge = product.badges[0];
  const fulfil = FULFILMENT[product.fulfilment];

  const wishlist = useWishlist();
  const toast = useToast();

  const saved = wishlist.has(product.slug);
  const singleVariant = product.variants.length === 1;
  const bookable = product.fulfilment === "bookable";

  const off = price.strikethrough
    ? Math.round(((price.strikethrough - price.amount) / price.strikethrough) * 100)
    : 0;

  function toggleSaved() {
    const nowSaved = wishlist.toggle(product);
    toast.toast(nowSaved ? "Saved to your wishlist" : "Removed from your wishlist");
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col",
        /* Viewport-relative, not a fixed 168px.

           At 375px a 168px card lands two-abreast with four pixels to
           spare, so the rail comes to rest with the second card sliced
           flat against the screen edge — no rounded corner, no gutter,
           and no hint that anything follows. It reads as clipped rather
           than scrollable, which is the difference between a carousel and
           a bug.

           40vw puts a deliberate fifth of the next card on screen at every
           phone size (21% at 375, 24% at 430). Capped so the rail does not
           grow absurd cards between `sm` and `lg`, where it is still a
           rail. */
        fill ? "w-full" : "w-[40vw] max-w-52 lg:w-auto lg:max-w-none",
      )}
    >
      {/* Square, and square for a reason rather than by default.
 
          A 4:5 tile was the obvious answer to "the bags look small" and
          it cost more than it bought. The catalogue holds two kinds of
          picture: generated art, which is square, and manufacturer
          photographs cropped off catalogue pages, which are usually
          landscape. A portrait tile letterboxes a landscape photograph to
          about sixty percent of its own height — the bathtub sat in the
          middle of the card with a band of empty paper above and below it
          — and it does not fit the square art either.
 
          Square fits the generated art exactly: same shape in, same shape
          out, nothing cropped and no band at all. A landscape photograph
          still bands, but by a quarter rather than two fifths. It is the
          ratio that is wrong for the fewest pictures. */}
      {/* Two boxes, because the inner one clips. The picture, the heart
          and the delivery chip all need `overflow-hidden` to stay inside
          the rounded corners; the Add pill has to hang *over* that edge,
          so it lives in an outer box that does not clip. */}
      <div className="relative">
      <div className="relative aspect-square overflow-hidden rounded-card border border-photo-edge bg-photo">
        <Link href={`/p/${product.slug}`} className="block size-full">
          <ProductImage
            photo={product.photo}
            swatchKey={product.image}
            label={product.title}
            brand={product.brand}
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, 45vw"
            className="size-full transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
          />
          {product.photoIsIllustration && (
            /* Says what the picture is. A generated image of a real SKU
               shown without this is a claim about goods the customer will
               receive that nobody has photographed. */
            <span className="absolute inset-x-0 bottom-0 bg-deep/75 px-2 py-1 text-center text-micro leading-tight text-on-deep backdrop-blur-sm">
              Illustration · actual product may vary
            </span>
          )}
        </Link>

        {off > 0 && (
          <span className="nums absolute left-2 top-2 rounded-sm bg-accent px-1.5 py-1 text-micro font-semibold leading-none text-on-accent">
            {off}% off
          </span>
        )}

        <button
          type="button"
          onClick={toggleSaved}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.title} from your wishlist` : `Save ${product.title}`}
          /* `tap-target`: 32px is the drawn size the card is built around,
             so the touch area is grown to 44px behind it instead.

             Always visible once saved, and always visible on a touch
             screen — a control revealed by hover is a control a phone
             cannot reach. `lg:opacity-0` is what makes it a hover
             affordance on a pointer device only. */
          className={cn(
            "tap-target absolute right-2 top-2 grid size-8 place-items-center rounded-full border bg-surface/90 backdrop-blur-sm transition-[opacity,color,border-color] duration-200",
            saved
              ? "border-accent-edge text-accent"
              : "border-line-soft text-muted hover:text-accent lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
          )}
        >
          {saved ? (
            <HeartFilled key="on" className="anim-pop size-4" />
          ) : (
            <Heart className="size-4" />
          )}
        </button>

        {/* Lifted clear of the illustration label, which is a full-width
            band pinned to `bottom-0` of the same box. Both sat on the
            bottom edge and the chip was drawn straight through the middle
            of the words on every generated tile — which is most of the
            catalogue. `bottom-2` on a card with no label, `bottom-9` on
            one with, so neither has to know about the other beyond this
            line. */}
        <span
          className={cn(
            "absolute left-2 inline-flex items-center gap-1 rounded-sm border border-line-soft bg-surface/90 px-1.5 py-1 text-micro text-ink backdrop-blur-sm",
            product.photoIsIllustration ? "bottom-9" : "bottom-2",
          )}
        >
          <fulfil.Icon className="size-3 text-accent" />
          {fulfil.label(product.leadTimeDays)}
        </span>
      </div>

        {/* Straddling the picture's bottom edge, as the reference does.
            It reads as a control belonging to the product rather than a
            row under it, and it gives the price and name the full width
            of the card back. */}
        <div className="absolute -bottom-4 right-2 z-10">
          {singleVariant && !bookable ? (
            <AddControl product={product} />
          ) : (
            <Link
              href={`/p/${product.slug}`}
              className="tap-target relative flex h-9 items-center justify-center rounded-full border-2 border-accent bg-surface px-3.5 text-caption font-bold uppercase tracking-wide text-accent shadow-sm transition-colors hover:bg-accent hover:text-on-accent"
            >
              Options
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-5">
        <Link href={`/p/${product.slug}`} className="flex flex-1 flex-col gap-1">
          {product.brand && (
            <span className="truncate text-micro uppercase tracking-wide text-muted">
              {product.brand}
            </span>
          )}

          {/* Clamped, not shortened. A Jaquar name carries its range, its
              fitting and often a model code, which runs past ninety
              characters and would push the price off a tile — but the
              whole name is what the customer needs on the detail page,
              and what they hover to read here. */}
          <h3
            className="line-clamp-2 text-body-sm leading-snug text-ink"
            title={product.title}
          >
            {product.title}
          </h3>

          <Rating value={rating} count={ratingCount} className="mt-0.5" />

          <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-2">
            <span className="nums text-title-sm font-semibold text-ink">
              {formatPrice(price.amount)}
            </span>
            <span className="text-micro text-muted">
              {price.isFrom ? "onwards" : PRICING_UNIT_LABEL[product.pricingUnit]}
            </span>
            {price.strikethrough && (
              <span className="nums text-micro text-faint line-through">
                {formatPrice(price.strikethrough)}
              </span>
            )}
          </div>

          {badge && (
            <Badge tone="accent" size="sm" className="mt-2 w-fit">
              {BADGE_LABEL[badge]}
            </Badge>
          )}
        </Link>

      </div>
    </article>
  );
}

/**
 * Add, then adjust — without leaving the grid.
 *
 * Three states in one row — 44px under a thumb, 40px where there is a
 * pointer. The stepper's `−` and `+` are the two most mis-tapped controls
 * in the app: they sit next to each other, they are used repeatedly, and
 * getting one wrong costs a unit of cement. 44 is the floor for a target
 * a finger drives, and this is exactly the case it exists for.
 *
 * Three states:
 *
 *   not in cart   a full-width "Add" button
 *   just added    a brief confirmed state, so the tap is visibly received
 *   in the cart   a −/qty/+ stepper on the same footprint
 *
 * The footprint never changes, which matters more than it sounds: a
 * control that grows when pressed shifts every card below it in the grid,
 * and on a phone that means the next thing the thumb lands on is not what
 * was under it a moment ago.
 *
 * Decrementing past the minimum removes the line, so the stepper's own
 * "−" empties it rather than sitting at 1 doing nothing.
 *
 * Every control in the row is drawn at 40px to hold that footprint, four
 * short of the 44px a thumb wants — so each one carries `tap-target` to
 * grow the hit area invisibly rather than the box itself.
 */
function AddControl({ product }: { product: Product }) {
  const router = useRouter();
  const { add, setQty, find } = useCart();
  const toast = useToast();
  const [flash, setFlash] = useState(false);

  const variant = product.variants[0];
  const line = find(product.slug, variant.id);

  if (!line) {
    return (
      <button
        type="button"
        onClick={() => {
          add(product, variant, variant.minQty);
          setFlash(true);
          window.setTimeout(() => setFlash(false), 900);
          toast.success(`Added ${product.title}`, {
            label: "View cart",
            onClick: () => router.push("/cart"),
          });
        }}
        className={cn(
          /* A pill on the page's own surface, outlined rather than
             filled: it sits on a photograph, and a tinted fill reads as
             part of the picture where a white chip reads as a control. */
          "tap-target relative flex h-9 items-center justify-center gap-1 rounded-full border-2 bg-surface px-3.5 text-caption font-bold uppercase tracking-wide shadow-sm transition-colors duration-150",
          flash
            ? "border-success text-success"
            : "border-accent text-accent hover:bg-accent hover:text-on-accent",
        )}
      >
        {flash ? (
          <>
            <Check className="size-4" />
            Added
          </>
        ) : (
          <>
            <Plus className="size-4" />
            Add
          </>
        )}
      </button>
    );
  }

  return (
    /* Same footprint as the pill it replaces, so adding a unit does not
       move the card under the thumb. */
    <div className="flex h-9 items-center justify-between rounded-full bg-accent text-on-accent shadow-sm">
      <button
        type="button"
        aria-label={`Decrease quantity of ${product.title}`}
        onClick={() => setQty(line.id, line.qty - variant.stepQty)}
        className="tap-target relative grid h-full w-9 shrink-0 place-items-center rounded-l-full transition-colors hover:bg-accent-dim"
      >
        {line.qty <= variant.minQty ? (
          <Trash className="size-4" />
        ) : (
          <Minus className="size-4" />
        )}
      </button>

      <span
        className="nums min-w-8 px-0.5 text-center text-caption font-semibold"
        aria-live="polite"
      >
        {line.qty}
      </span>

      <button
        type="button"
        aria-label={`Increase quantity of ${product.title}`}
        onClick={() => setQty(line.id, line.qty + variant.stepQty)}
        className="tap-target relative grid h-full w-9 shrink-0 place-items-center rounded-r-full transition-colors hover:bg-accent-dim"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
