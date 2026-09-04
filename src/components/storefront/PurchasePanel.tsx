"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  Calendar,
  Cart,
  Check,
  Heart,
  HeartFilled,
  Info,
  Minus,
  Plus,
} from "@/components/icons";
import { useCart, type BookingSlot } from "@/lib/store/cart";
import { useWishlist } from "@/lib/store/wishlist";
import {
  applyWastage,
  areaFromDimensions,
  lineTotal,
  normalizeQty,
  WASTAGE_RATE,
} from "@/lib/cart/quantity";
import {
  formatPrice,
  PRICING_UNIT_LABEL,
  proSaving,
  resolveVariantPrice,
  type Product,
} from "@/lib/types/catalog";

/**
 * The buy box.
 *
 * The reason the product detail screen needs its own component at all:
 * "add one to cart" is meaningless for three of Quoin's four fulfilment
 * types. Area-priced stone needs a measurement, a site visit needs a slot,
 * and multi-variant paint needs a pack size chosen before a price is even
 * quotable. Each branch renders from `fulfilment` and `pricingUnit` rather
 * than being hand-wired per product.
 *
 * Both actions are real. "Add to cart" writes a line and confirms without
 * navigating — the most common next thing is to keep shopping. "Buy now"
 * adds the same line and goes straight to checkout, which is the only
 * difference between them; a "buy now" that bypasses the cart entirely
 * ends up with its own half of the checkout logic and they drift.
 */
export function PurchasePanel({
  product,
  isPro = false,
}: {
  product: Product;
  isPro?: boolean;
}) {
  const router = useRouter();
  const { add } = useCart();
  const wishlist = useWishlist();
  const toast = useToast();

  const [variantId, setVariantId] = useState(product.variants[0].id);
  const variant =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];

  const price = resolveVariantPrice(variant, isPro);
  const isArea = product.pricingUnit === "per_sqft";
  const isBookable = product.fulfilment === "bookable";

  /* Area products are driven by measurements; everything else by a plain
     count. Both funnel into the same normalised `qty`. */
  const [lengthFt, setLengthFt] = useState("10");
  const [widthFt, setWidthFt] = useState("12");
  const [wastage, setWastage] = useState(true);
  const [count, setCount] = useState(variant.minQty);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [added, setAdded] = useState(false);

  const measuredArea = areaFromDimensions(Number(lengthFt), Number(widthFt));
  const withWastage = applyWastage(measuredArea, wastage);

  const qty = isBookable ? 1 : normalizeQty(variant, isArea ? withWastage : count);

  const total = lineTotal(price.amount, qty);
  const saving = proSaving(variant);
  const saved = wishlist.has(product.slug);

  function addLine() {
    add(product, variant, qty, slot ?? undefined);
  }

  function onAdd() {
    addLine();
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
    toast.success(
      isBookable ? "Visit added to your cart" : `Added ${qty} to your cart`,
      { label: "View cart", onClick: () => router.push("/cart") },
    );
  }

  function onBuyNow() {
    addLine();
    router.push("/checkout");
  }

  return (
    <div className="space-y-5">
      {product.variants.length > 1 && (
        <Section label={isArea ? "Select slab" : "Select option"}>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => {
              const on = v.id === variant.id;
              const vp = resolveVariantPrice(v, isPro);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setVariantId(v.id);
                    setCount(v.minQty);
                  }}
                  aria-pressed={on}
                  className={cn(
                    "min-w-24 rounded-lg border px-3 py-2 text-left transition-colors",
                    on
                      ? "border-accent bg-accent-wash"
                      : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <span
                    className={cn(
                      "block text-caption",
                      on ? "text-ink" : "text-muted",
                    )}
                  >
                    {v.label}
                  </span>
                  <span
                    className={cn(
                      "nums block text-micro",
                      on ? "text-accent" : "text-faint",
                    )}
                  >
                    {formatPrice(vp.amount)}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {isBookable ? (
        <SlotPicker value={slot} onChange={setSlot} />
      ) : isArea ? (
        <Section label="Area required">
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-end gap-3">
              <Dimension label="Length" value={lengthFt} onChange={setLengthFt} />
              <span className="pb-2.5 text-muted" aria-hidden>
                ×
              </span>
              <Dimension label="Width" value={widthFt} onChange={setWidthFt} />
              <span className="pb-2.5 text-caption text-muted">ft</span>
            </div>

            <button
              type="button"
              onClick={() => setWastage((w) => !w)}
              aria-pressed={wastage}
              className="mt-4 flex w-full items-center gap-2.5 text-left"
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-xs border transition-colors",
                  wastage
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line-strong text-transparent",
                )}
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span className="text-caption text-ink">
                Add {Math.round(WASTAGE_RATE * 100)}% cutting allowance
              </span>
            </button>
            <p className="ml-7.5 mt-1 text-micro leading-snug text-faint">
              Trade practice for stone and tile. Order the exact measured area
              and breakage during cutting will leave you short.
            </p>

            <dl className="mt-4 space-y-1.5 border-t border-line-hair pt-3 text-caption">
              <Row k="Measured area" v={`${measuredArea.toFixed(1)} sq.ft.`} />
              {wastage && (
                <Row
                  k={`With ${Math.round(WASTAGE_RATE * 100)}% allowance`}
                  v={`${withWastage.toFixed(1)} sq.ft.`}
                />
              )}
              <Row k="Ordering" v={`${qty} sq.ft.`} strong />
            </dl>

            <p className="mt-2.5 flex items-start gap-1.5 text-micro leading-snug text-faint">
              <Info className="mt-px size-3.5 shrink-0" />
              Sold in {variant.minQty} sq.ft. minimum, in steps of{" "}
              {variant.stepQty} — slabs cannot be cut smaller.
            </p>
          </div>
        </Section>
      ) : (
        <Section label="Quantity">
          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-lg border border-line bg-surface">
              <Stepper
                label="Decrease quantity"
                onClick={() =>
                  setCount((c) => Math.max(variant.minQty, c - variant.stepQty))
                }
                disabled={qty <= variant.minQty}
              >
                <Minus className="size-4" />
              </Stepper>
              <span className="nums min-w-12 text-center text-body font-semibold text-ink">
                {qty}
              </span>
              <Stepper
                label="Increase quantity"
                onClick={() => setCount((c) => c + variant.stepQty)}
              >
                <Plus className="size-4" />
              </Stepper>
            </div>
            <span className="text-caption text-muted">
              {PRICING_UNIT_LABEL[product.pricingUnit]}
              {variant.minQty > 1 && ` · minimum ${variant.minQty}`}
            </span>
          </div>
        </Section>
      )}

      {/* The total is always shown, because for area-priced goods the unit
          price bears no relation to what will actually be charged. */}
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="nums text-caption text-muted">
            {formatPrice(price.amount)} {PRICING_UNIT_LABEL[product.pricingUnit]}
            {!isBookable && ` × ${qty}`}
          </span>
          <span className="nums text-title font-semibold text-ink">
            {formatPrice(total)}
          </span>
        </div>

        {price.strikethrough && (
          <p className="nums mt-1 text-caption text-faint">
            <span className="line-through">
              {formatPrice(lineTotal(price.strikethrough, qty))}
            </span>{" "}
            <span className="text-success">
              Save {formatPrice(lineTotal(price.strikethrough - price.amount, qty))}
            </span>
          </p>
        )}

        {!isPro && saving && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-pro-wash px-3 py-2 text-micro leading-snug text-pro">
            <Badge tone="pro" size="sm">
              Pro
            </Badge>
            Members pay {formatPrice(lineTotal(saving, qty))} less on this order.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Button
          block
          size="lg"
          onClick={onAdd}
          variant={added ? "subtle" : "primary"}
        >
          {added ? (
            <>
              <Check className="size-4.5" />
              Added to cart
            </>
          ) : (
            <>
              <Cart className="size-4.5" />
              {isBookable ? "Add this visit" : "Add to cart"}
            </>
          )}
        </Button>

        <div className="flex gap-2">
          {/* `flex-1`, not `block`. `block` is `w-full`, which in a flex
              row takes the whole line and pushes the wishlist button off
              the right edge of the page. */}
          <Button
            size="lg"
            variant="secondary"
            onClick={onBuyNow}
            className="flex-1"
          >
            Buy now
          </Button>
          <Button
            size="icon-lg"
            variant="outline"
            aria-pressed={saved}
            aria-label={saved ? "Remove from your wishlist" : "Save for later"}
            onClick={() => {
              const nowSaved = wishlist.toggle(product);
              toast.toast(
                nowSaved ? "Saved to your wishlist" : "Removed from your wishlist",
              );
            }}
            className={cn(saved && "border-accent-edge text-accent")}
          >
            {saved ? (
              <HeartFilled className="anim-pop size-5" />
            ) : (
              <Heart className="size-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- parts */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-micro font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function Dimension({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-micro text-faint">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="nums h-10 w-full rounded-lg border border-line bg-raised px-3 text-body text-ink outline-none transition-colors focus:border-accent"
      />
    </label>
  );
}

function Stepper({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-11 place-items-center rounded-lg text-ink transition-colors hover:bg-hover disabled:text-faint disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * Slot picking for bookable services.
 *
 * Fixture windows for now — the real list comes from professional
 * availability in the services module, which is why the shape is already
 * date plus window rather than a free-text field. The chosen slot is
 * carried onto the cart line, so it survives to checkout rather than being
 * asked for twice.
 */
function SlotPicker({
  value,
  onChange,
}: {
  value: BookingSlot | null;
  onChange: (slot: BookingSlot) => void;
}) {
  const days = useMemo(() => {
    /* Formatted in IST explicitly rather than the runtime default. A UTC
       server would otherwise disagree with an IST browser about what day
       it is — a hydration mismatch. Slots are Indian business hours
       regardless of where the customer's device thinks it is. */
    const fmt = new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      timeZone: "Asia/Kolkata",
    });
    const out: { key: string; day: string; date: string }[] = [];
    const base = new Date();
    for (let i = 1; i <= 5; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const parts = fmt.formatToParts(d);
      out.push({
        key: d.toISOString().slice(0, 10),
        day: parts.find((p) => p.type === "weekday")?.value ?? "",
        date: parts.find((p) => p.type === "day")?.value ?? "",
      });
    }
    return out;
  }, []);

  const times = ["09:00 – 11:00", "11:00 – 13:00", "14:00 – 16:00", "16:00 – 18:00"];
  const day = value?.date ?? days[0].key;
  const window = value?.window ?? times[0];

  return (
    <Section label="Choose a slot">
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="rail gap-2">
          {days.map((d) => {
            const on = d.key === day;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onChange({ date: d.key, window })}
                aria-pressed={on}
                className={cn(
                  "flex w-14 flex-col items-center gap-0.5 rounded-lg border py-2 transition-colors",
                  on ? "border-accent bg-accent-wash" : "border-line hover:border-line-strong",
                )}
              >
                <span className={cn("text-micro", on ? "text-accent" : "text-faint")}>
                  {d.day}
                </span>
                <span
                  className={cn("nums text-body", on ? "text-ink" : "text-muted")}
                >
                  {d.date}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {times.map((t) => {
            const on = t === window;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ date: day, window: t })}
                aria-pressed={on}
                className={cn(
                  "nums flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-caption transition-colors",
                  on
                    ? "border-accent bg-accent-wash text-accent"
                    : "border-line text-muted hover:border-line-strong",
                )}
              >
                <Calendar className="size-3.5" />
                {t}
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={cn("nums", strong ? "font-semibold text-ink" : "text-muted")}>
        {v}
      </dd>
    </div>
  );
}
