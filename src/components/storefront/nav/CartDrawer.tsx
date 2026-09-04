"use client";

import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductImage } from "@/components/storefront/ProductImage";
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
import { useToast } from "@/components/ui/Toast";

/**
 * The cart, without leaving the page.
 *
 * A drawer rather than a route because the most common thing a customer
 * does after adding an item is add another one, and a full-page cart makes
 * that a round trip through two navigations. `/cart` still exists and
 * still works — it is the shareable, linkable version and the one that
 * survives a refresh mid-checkout — but nothing forces you through it.
 *
 * The cart is grouped by fulfilment, which is the whole reason this is not
 * a flat list. Cement, a booked electrician and a cut marble slab do not
 * arrive together and cannot share one delivery estimate; showing them in
 * one undifferentiated list is what turns a delivery promise into an
 * argument at the door.
 */

const GROUP_ICON: Record<FulfilmentType, typeof Clock> = {
  instant: Clock,
  scheduled: Truck,
  made_to_order: Ruler,
  bookable: Calendar,
};

export function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { groups, lines, count, subtotalPaise, savingsPaise } = useCart();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Your cart"
      /* A bottom sheet on a phone, a right panel from `sm`. A full-height
         side panel on a 390px screen is just the page again with a scrim
         behind it, and it puts the checkout button at the top of a long
         list instead of under the thumb. */
      side="responsive"
      description={
        count > 0 ? `${count} ${count === 1 ? "item" : "items"}` : undefined
      }
      footer={
        lines.length > 0 ? (
          <Summary
            subtotalPaise={subtotalPaise}
            savingsPaise={savingsPaise}
            onNavigate={onClose}
          />
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <div className="p-5">
          <EmptyState
            compact
            icon={<Cart className="size-6" />}
            title="Your cart is empty"
            action={{ href: "/products", label: "Browse the catalogue" }}
          >
            Materials, fittings and expert visits all go in here — and stay
            grouped by how each one reaches you.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-6 p-5">
          {groups.map((group) => (
            <Group key={group.fulfilment} group={group} onNavigate={onClose} />
          ))}
        </div>
      )}
    </Drawer>
  );
}

function Group({
  group,
  onNavigate,
}: {
  group: CartGroup;
  onNavigate: () => void;
}) {
  const promise = GROUP_PROMISE[group.fulfilment];
  const Icon = GROUP_ICON[group.fulfilment];
  /* The slowest item in the group is what the group actually promises —
     a two-day and a seven-day line together arrive in seven. */
  const leadDays = group.lines.reduce(
    (max, l) => Math.max(max, l.snapshot.leadTimeDays ?? 0),
    0,
  );

  return (
    <section>
      <header className="mb-3 flex items-start gap-2.5 rounded-lg bg-sunk px-3 py-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-caption font-semibold text-ink">{promise.title}</p>
          <p className="text-micro leading-snug text-muted">
            {promise.detail(leadDays || undefined)}
          </p>
        </div>
      </header>

      <ul className="space-y-3">
        {group.lines.map((line) => (
          <Line key={line.id} line={line} onNavigate={onNavigate} />
        ))}
      </ul>
    </section>
  );
}

function Line({ line, onNavigate }: { line: CartLine; onNavigate: () => void }) {
  const { setQty, remove } = useCart();
  const toast = useToast();
  const s = line.snapshot;
  const bookable = s.fulfilment === "bookable";

  return (
    <li className="flex gap-3">
      <Link
        href={`/p/${line.productSlug}`}
        onClick={onNavigate}
        className="size-18 shrink-0 overflow-hidden rounded-lg border border-photo-edge bg-photo"
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
          onClick={onNavigate}
          className="line-clamp-2 text-body-sm leading-snug text-ink hover:text-accent"
        >
          {s.title}
        </Link>
        {s.variantLabel && (
          <p className="mt-0.5 text-micro text-muted">{s.variantLabel}</p>
        )}
        {line.slot && (
          <p className="mt-0.5 text-micro text-accent">
            {line.slot.date} · {line.slot.window}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          {bookable ? (
            /* A visit is one visit. A stepper here would offer to book
               the same electrician into the same slot twice. */
            <span className="text-micro text-muted">One visit</span>
          ) : (
            <div className="flex items-center rounded-lg border border-line">
              <StepButton
                label={`Decrease quantity of ${s.title}`}
                onClick={() => setQty(line.id, line.qty - s.stepQty)}
              >
                <Minus className="size-3.5" />
              </StepButton>
              <span className="nums min-w-10 text-center text-caption font-medium text-ink">
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

          <span className="nums text-body-sm font-semibold text-ink">
            {formatPrice(s.pricePaise * line.qty)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-micro text-faint">
            {formatPrice(s.pricePaise)} {PRICING_UNIT_LABEL[s.pricingUnit]}
          </span>
          <button
            type="button"
            onClick={() => {
              remove(line.id);
              toast.toast(`Removed ${s.title}`);
            }}
            className="flex items-center gap-1 text-micro text-muted transition-colors hover:text-danger"
          >
            <Trash className="size-3.5" />
            Remove
          </button>
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
      className="grid size-9 place-items-center rounded-lg text-ink transition-colors hover:bg-hover"
    >
      {children}
    </button>
  );
}

/**
 * The money.
 *
 * Taxes and delivery are named and marked as calculated at checkout rather
 * than estimated here. An "estimated total" that moves at the payment step
 * is the single most reliable way to lose an order, and Quoin cannot know
 * the delivery charge until the split by fulfilment is priced against a
 * real address.
 */
function Summary({
  subtotalPaise,
  savingsPaise,
  onNavigate,
}: {
  subtotalPaise: number;
  savingsPaise: number;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-3">
      <dl className="space-y-1.5 text-body-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Subtotal</dt>
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
          <dt className="text-muted">Delivery &amp; taxes</dt>
          <dd className="text-micro text-faint">Calculated at checkout</dd>
        </div>
      </dl>

      <Button href="/checkout" block onClick={onNavigate}>
        Proceed to checkout
      </Button>
      <Link
        href="/cart"
        onClick={onNavigate}
        className="block text-center text-caption text-muted transition-colors hover:text-accent"
      >
        View the full cart
      </Link>
    </div>
  );
}
