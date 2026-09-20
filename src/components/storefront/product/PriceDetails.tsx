"use client";

import { useState } from "react";
import { Chevron } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { formatPrice, taxForLine, type Paise } from "@/lib/types/catalog";

/**
 * What the total is made of.
 *
 * Indian catalogue apps all carry some version of this, and the reason is
 * the same everywhere: a price that is inclusive of tax looks like a price
 * that has not been taxed yet, and the customer finds out which at the
 * payment screen. Quoin's prices *are* inclusive — every `pricePaise` in
 * the database arrived as an MRP or a retail price, both of which contain
 * GST by law — so the only number that can be added here is the one that
 * was inside the price all along.
 *
 * Which is why this is a disclosure and not a line in the total. GST is
 * not a charge to announce; it is a component to be able to check. Folded
 * shut it is one muted sentence saying the price is inclusive, and that
 * sentence is the part that actually needs to be on screen.
 *
 * **It never states a tax Quoin has not charged.** The figure comes from
 * `taxForLine` — the same function the order and the invoice use — run
 * against the same slab checkout will freeze onto the line. A second
 * formula here that rounded differently would put a different rupee
 * figure on the product page than on the receipt.
 */
export function PriceDetails({
  /** Line total the customer will pay, tax included. */
  total,
  /** MRP × quantity, when it is above what is being charged. */
  mrpTotal,
  gstRatePct,
}: {
  total: Paise;
  mrpTotal: Paise | null;
  gstRatePct: number;
}) {
  const [open, setOpen] = useState(false);

  const tax = taxForLine(total, gstRatePct);
  /* The taxable value, i.e. what is left of the line once the contained
     GST is taken back out. Subtracted rather than computed, so the two
     figures always sum to the total the customer is charged — deriving
     both independently lets the rounding leave a paise unaccounted for. */
  const taxable = total - tax;
  const discount = mrpTotal != null && mrpTotal > total ? mrpTotal - total : null;

  return (
    <div className="mt-3 border-t border-line-hair pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 text-caption text-muted transition-colors hover:text-ink"
      >
        Inclusive of all taxes
        <Chevron
          className={cn(
            "size-3.5 transition-transform duration-200",
            open ? "-rotate-90" : "rotate-90",
          )}
        />
      </button>

      {open && (
        <dl className="nums mt-2.5 space-y-1.5 text-caption">
          {mrpTotal != null && (
            <Row label="Maximum retail price" value={formatPrice(mrpTotal)} />
          )}
          {discount && (
            <Row
              label="Discount"
              value={`− ${formatPrice(discount)}`}
              tone="success"
            />
          )}

          <Row label="Taxable value" value={formatPrice(taxable)} />
          <Row label={`GST @ ${gstRatePct}%`} value={formatPrice(tax)} />

          <div className="flex items-baseline justify-between gap-3 border-t border-line-hair pt-1.5 font-semibold text-ink">
            <dt>You pay</dt>
            <dd>{formatPrice(total)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={tone === "success" ? "text-success" : "text-ink"}>{value}</dd>
    </div>
  );
}
