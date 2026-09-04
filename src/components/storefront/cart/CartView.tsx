"use client";

import Link from "next/link";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  Calendar,
  Cart,
  Clock,
  Minus,
  Plus,
  Ruler,
  Trash,
  Truck,
} from "@/components/icons";
import {
  GROUP_PROMISE,
  useCart,
  type CartGroup,
  type CartLine,
} from "@/lib/store/cart";
import {
  PRICING_UNIT_LABEL,
  formatPrice,
  type FulfilmentType,
} from "@/lib/types/catalog";
import { StickyBar } from "@/components/storefront/StickyBar";

/**
 * The full cart page.
 *
 * The drawer is the fast path; this is the one that survives a refresh, can
 * be shared to a colleague, and has room to explain the split. Both render
 * from the same store and the same grouping, so they cannot disagree about
 * what is in the basket or what it costs.
 *
 * On a phone the summary is a sticky bar at the foot rather than a card
 * below the list — a total you have to scroll past twelve lines to reach is
 * a total nobody checks before paying.
 */

const GROUP_ICON: Record<FulfilmentType, typeof Clock> = {
  instant: Clock,
  scheduled: Truck,
  made_to_order: Ruler,
  bookable: Calendar,
};

export function CartView() {
  const { groups, lines, count, subtotalPaise, savingsPaise, ready, clear } =
    useCart();

  if (!ready) return <ListSkeleton rows={3} />;

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<Cart className="size-6" />}
        title="Your cart is waiting"
        action={{ href: "/products", label: "Explore materials" }}
        secondaryAction={{ href: "/upload", label: "Upload a parcha" }}
      >
        Materials, fittings and expert visits all go in here — and stay grouped
        by how each one reaches you, so nothing promises a delivery date it
        cannot keep.
      </EmptyState>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <div className="space-y-6 pb-4">
        {groups.map((group) => (
          <Group key={group.fulfilment} group={group} />
        ))}

        <button
          type="button"
          onClick={clear}
          className="text-caption text-muted transition-colors hover:text-danger"
        >
          Empty the cart
        </button>
      </div>

      {/* Desktop: a sticky summary column. Mobile: the sticky bar below. */}
      <Card
        padding="lg"
        className="mt-8 hidden lg:sticky lg:top-24 lg:mt-0 lg:block"
      >
        <Summary
          count={count}
          subtotalPaise={subtotalPaise}
          savingsPaise={savingsPaise}
        />
      </Card>

      <StickyBar>
        <div className="min-w-0 flex-1">
          <p className="nums text-title-sm font-semibold text-ink">
            {formatPrice(subtotalPaise)}
          </p>
          <p className="text-micro text-muted">
            {count} {count === 1 ? "item" : "items"} · delivery at checkout
          </p>
        </div>
        <Button href="/checkout" size="lg" className="shrink-0">
          Checkout
        </Button>
      </StickyBar>
    </div>
  );
}

function Group({ group }: { group: CartGroup }) {
  const promise = GROUP_PROMISE[group.fulfilment];
  const Icon = GROUP_ICON[group.fulfilment];
  /* The slowest item in the group is what the group actually promises — a
     two-day and a seven-day line together arrive in seven. */
  const leadDays = group.lines.reduce(
    (max, l) => Math.max(max, l.snapshot.leadTimeDays ?? 0),
    0,
  );

  return (
    <section className="overflow-hidden rounded-card border border-line-soft bg-surface">
      <header className="flex items-start gap-3 border-b border-line-hair bg-raised px-4 py-3">
        <Icon className="mt-0.5 size-4.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold text-ink">{promise.title}</p>
          <p className="mt-0.5 text-micro leading-snug text-muted">
            {promise.detail(leadDays || undefined)}
          </p>
        </div>
        <span className="nums shrink-0 text-body-sm font-semibold text-ink">
          {formatPrice(group.subtotalPaise)}
        </span>
      </header>

      <ul className="divide-y divide-line-hair">
        {group.lines.map((line) => (
          <Line key={line.id} line={line} />
        ))}
      </ul>
    </section>
  );
}

function Line({ line }: { line: CartLine }) {
  const { setQty, remove } = useCart();
  const toast = useToast();
  const s = line.snapshot;
  const bookable = s.fulfilment === "bookable";

  return (
    <li className="flex gap-3 p-4">
      <Link
        href={`/p/${line.productSlug}`}
        className="size-20 shrink-0 overflow-hidden rounded-lg border border-photo-edge bg-photo"
      >
        <ProductImage
          photo={s.photo}
          swatchKey={s.image}
          label={s.title}
          className="size-full"
        />
      </Link>

      <div className="min-w-0 flex-1">
        {s.brand && (
          <p className="text-micro uppercase tracking-wide text-muted">{s.brand}</p>
        )}
        <Link
          href={`/p/${line.productSlug}`}
          className="line-clamp-2 text-body-sm leading-snug text-ink transition-colors hover:text-accent"
        >
          {s.title}
        </Link>

        <p className="nums mt-0.5 text-micro text-faint">
          {s.variantLabel && `${s.variantLabel} · `}
          {formatPrice(s.pricePaise)} {PRICING_UNIT_LABEL[s.pricingUnit]}
        </p>

        {line.slot && (
          <p className="nums mt-1 text-micro text-accent">
            {line.slot.date} · {line.slot.window}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-3">
          {bookable ? (
            <span className="text-micro text-muted">One visit</span>
          ) : (
            <div className="flex items-center rounded-lg border border-line">
              <StepButton
                label={`Decrease quantity of ${s.title}`}
                onClick={() => setQty(line.id, line.qty - s.stepQty)}
              >
                <Minus className="size-3.5" />
              </StepButton>
              <span className="nums min-w-11 text-center text-caption font-semibold text-ink">
                {line.qty}
              </span>
              <StepButton
                label={`Increase quantity of ${s.title}`}
                onClick={() => setQty(line.id, line.qty + s.stepQty)}
              >
                <Plus className="size-3.5" />
              </StepButton>
            </div>
          )}

          <div className="flex items-center gap-3">
            <span className="nums text-body font-semibold text-ink">
              {formatPrice(s.pricePaise * line.qty)}
            </span>
            <button
              type="button"
              aria-label={`Remove ${s.title}`}
              onClick={() => {
                remove(line.id);
                toast.toast(`Removed ${s.title}`);
              }}
              className="rounded-md p-1.5 text-faint transition-colors hover:text-danger"
            >
              <Trash className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function StepButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-lg text-ink transition-colors hover:bg-hover"
    >
      {children}
    </button>
  );
}

/**
 * The money.
 *
 * Delivery and taxes are named and marked as calculated at checkout rather
 * than estimated here. An "estimated total" that moves at the payment step
 * is the single most reliable way to lose an order, and Quoin cannot know
 * the delivery charge until the split by fulfilment is priced against a
 * real address.
 */
function Summary({
  count,
  subtotalPaise,
  savingsPaise,
}: {
  count: number;
  subtotalPaise: number;
  savingsPaise: number;
}) {
  return (
    <div>
      <h2 className="text-title-sm font-semibold text-ink">Order summary</h2>

      <dl className="mt-4 space-y-2 text-body-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">
            Subtotal <span className="nums text-faint">({count} items)</span>
          </dt>
          <dd className="nums font-medium text-ink">{formatPrice(subtotalPaise)}</dd>
        </div>
        {savingsPaise > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">You save</dt>
            <dd className="nums font-medium text-success">
              −{formatPrice(savingsPaise)}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Delivery</dt>
          <dd className="text-micro text-faint">Calculated at checkout</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Taxes</dt>
          <dd className="text-micro text-faint">Calculated at checkout</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line-hair pt-4">
        <span className="text-body font-semibold text-ink">Total so far</span>
        <span className="nums text-title font-semibold text-ink">
          {formatPrice(subtotalPaise)}
        </span>
      </div>

      <Button href="/checkout" block size="lg" className="mt-5">
        Proceed to checkout
      </Button>

      <p className="mt-3 text-center text-micro text-faint">
        Prices are re-checked against the catalogue before payment.
      </p>
    </div>
  );
}
