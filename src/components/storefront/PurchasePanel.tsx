"use client";

import { useMemo, useState } from "react";
import { Calendar, Check, Info, Minus, Plus } from "@/components/icons";
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
 * Buy box.
 *
 * The whole reason the product detail screen exists as its own component:
 * "add one to cart" is meaningless for three of Quoin's four fulfilment
 * types. Area-priced stone needs a measurement, a site visit needs a slot,
 * and multi-variant paint needs a pack size chosen before a price is even
 * quotable. Each branch is rendered from `fulfilment` and `pricingUnit`
 * rather than hand-wired per product.
 */
export function PurchasePanel({
  product,
  isPro = false,
}: {
  product: Product;
  isPro?: boolean;
}) {
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

  const measuredArea = areaFromDimensions(Number(lengthFt), Number(widthFt));
  const withWastage = applyWastage(measuredArea, wastage);

  const qty = isBookable
    ? 1
    : normalizeQty(variant, isArea ? withWastage : count);

  const total = lineTotal(price.amount, qty);
  const saving = proSaving(variant);

  return (
    <div className="space-y-5">
      {product.variants.length > 1 && (
        <Field label="Select option">
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => {
              const on = v.id === variant.id;
              const vp = resolveVariantPrice(v, isPro);
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setVariantId(v.id);
                    setCount(v.minQty);
                  }}
                  aria-pressed={on}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    on
                      ? "border-gold bg-gold-wash"
                      : "border-line bg-surface hover:border-muted"
                  }`}
                >
                  <span
                    className={`block text-[13px] ${on ? "text-ink" : "text-muted"}`}
                  >
                    {v.label}
                  </span>
                  <span
                    className={`block text-xs ${on ? "text-gold" : "text-faint"}`}
                  >
                    {formatPrice(vp.amount)}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {isBookable ? (
        <SlotPicker />
      ) : isArea ? (
        <Field label="Area required">
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-end gap-3">
              <Dimension label="Length" value={lengthFt} onChange={setLengthFt} />
              <span className="pb-2.5 text-muted">×</span>
              <Dimension label="Width" value={widthFt} onChange={setWidthFt} />
              <span className="pb-2.5 text-xs text-muted">ft</span>
            </div>

            <button
              onClick={() => setWastage((w) => !w)}
              aria-pressed={wastage}
              className="mt-4 flex w-full items-center gap-2.5 text-left"
            >
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                  wastage
                    ? "border-gold bg-gold text-black"
                    : "border-line text-transparent"
                }`}
              >
                <Check className="size-3.5" />
              </span>
              <span className="text-[13px] text-ink">
                Add {Math.round(WASTAGE_RATE * 100)}% cutting allowance
              </span>
            </button>
            <p className="ml-7.5 mt-1 text-[11px] leading-snug text-faint">
              Trade practice for stone and tile. Order the exact measured area
              and breakage during cutting will leave you short.
            </p>

            <dl className="mt-4 space-y-1.5 border-t border-line-soft pt-3 text-xs">
              <Row
                k="Measured area"
                v={`${measuredArea.toFixed(1)} sq.ft.`}
              />
              {wastage && (
                <Row
                  k={`With ${Math.round(WASTAGE_RATE * 100)}% allowance`}
                  v={`${withWastage.toFixed(1)} sq.ft.`}
                />
              )}
              <Row k="Ordering" v={`${qty} sq.ft.`} strong />
            </dl>

            <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-faint">
              <Info className="mt-px size-3.5 shrink-0" />
              Sold in {variant.minQty} sq.ft. minimum, in steps of{" "}
              {variant.stepQty} — slabs cannot be cut smaller.
            </p>
          </div>
        </Field>
      ) : (
        <Field label="Quantity">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
              <Stepper
                label="Decrease quantity"
                onClick={() => setCount((c) => Math.max(variant.minQty, c - variant.stepQty))}
                disabled={qty <= variant.minQty}
              >
                <Minus className="size-4" />
              </Stepper>
              <span className="min-w-12 text-center text-sm font-medium text-ink">
                {qty}
              </span>
              <Stepper
                label="Increase quantity"
                onClick={() => setCount((c) => c + variant.stepQty)}
              >
                <Plus className="size-4" />
              </Stepper>
            </div>
            <span className="text-xs text-muted">
              {PRICING_UNIT_LABEL[product.pricingUnit]}
            </span>
          </div>
        </Field>
      )}

      {/* Total is always shown, because for area-priced goods the unit
          price bears no relation to what will actually be charged. */}
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted">
            {formatPrice(price.amount)} {PRICING_UNIT_LABEL[product.pricingUnit]}
            {!isBookable && ` × ${qty}`}
          </span>
          <span className="text-xl font-semibold text-gold">
            {formatPrice(total)}
          </span>
        </div>

        {price.strikethrough && (
          <p className="mt-1 text-xs text-faint">
            <span className="line-through">
              {formatPrice(lineTotal(price.strikethrough, qty))}
            </span>{" "}
            <span className="text-success">
              Save {formatPrice(lineTotal(price.strikethrough - price.amount, qty))}
            </span>
          </p>
        )}

        {!isPro && saving && (
          <p className="mt-2.5 rounded-lg bg-gold-wash px-3 py-2 text-[11px] leading-snug text-gold">
            Quoin Pro members pay {formatPrice(lineTotal(saving, qty))} less on
            this order.
          </p>
        )}
      </div>

      <button className="w-full rounded-xl bg-gold py-3.5 text-sm font-semibold text-black transition-colors hover:bg-gold-bright">
        {isBookable ? "Book this visit" : "Add to cart"}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- parts */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
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
      <span className="mb-1 block text-[11px] text-faint">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-gold"
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
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-lg text-ink transition-colors hover:bg-hover disabled:text-faint disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * Slot picking for bookable services. Static fixture slots for now — the
 * real list comes from professional availability in the services module,
 * which is why the shape is already date + time rather than a free field.
 */
function SlotPicker() {
  const days = useMemo(() => {
    /* Formatted in IST explicitly rather than the runtime default. This
       component server-renders too, and a UTC server would otherwise
       disagree with an IST browser about what day it is — a hydration
       mismatch. Slots are Indian business hours regardless of where the
       customer's device thinks it is. */
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
  const [day, setDay] = useState(days[0].key);
  const [time, setTime] = useState(times[0]);

  return (
    <Field label="Choose a slot">
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="rail gap-2">
          {days.map((d) => {
            const on = d.key === day;
            return (
              <button
                key={d.key}
                onClick={() => setDay(d.key)}
                aria-pressed={on}
                className={`flex w-14 flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors ${
                  on ? "border-gold bg-gold-wash" : "border-line hover:border-muted"
                }`}
              >
                <span className={`text-[10px] ${on ? "text-gold" : "text-faint"}`}>
                  {d.day}
                </span>
                <span className={`text-sm ${on ? "text-ink" : "text-muted"}`}>
                  {d.date}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {times.map((t) => {
            const on = t === time;
            return (
              <button
                key={t}
                onClick={() => setTime(t)}
                aria-pressed={on}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs transition-colors ${
                  on
                    ? "border-gold bg-gold-wash text-gold"
                    : "border-line text-muted hover:border-muted"
                }`}
              >
                <Calendar className="size-3.5" />
                {t}
              </button>
            );
          })}
        </div>
      </div>
    </Field>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={strong ? "font-medium text-ink" : "text-muted"}>{v}</dd>
    </div>
  );
}
