"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Steps } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/ErrorState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { StickyBar } from "@/components/storefront/StickyBar";
import { SignInPanel } from "@/components/storefront/auth/SignInPanel";
import {
  AddressPicker,
  type Address,
} from "@/components/storefront/checkout/AddressPicker";
import { cn } from "@/components/ui/cn";
import {
  Alert,
  ArrowRight,
  Back,
  Calendar,
  Cart,
  Check,
  CheckCircle,
  Clock,
  CreditCard,
  Headset,
  Rupee,
  Ruler,
  Truck,
} from "@/components/icons";
import { GROUP_PROMISE, useCart } from "@/lib/store/cart";
import { formatPrice, type FulfilmentType } from "@/lib/types/catalog";
import type { Quote } from "@/lib/data/checkout";

/**
 * Checkout.
 *
 * Four steps, one screen at a time, because a checkout that shows
 * everything at once is a checkout people abandon on a phone. The step
 * indicator is not decoration: it is the thing that makes a form feel
 * bounded.
 *
 * Two decisions worth naming:
 *
 * **The cart is re-priced by the server before anything else happens.**
 * The browser's snapshot is for drawing quickly; it can be stale, and it
 * can be edited. `/api/v1/checkout/quote` prices every line again against
 * the live catalogue and reports what moved, and any movement is shown to
 * the customer before they continue. A checkout that discovers a price
 * change after payment is a refund.
 *
 * **Payment is not taken.** There is no payments module and no orders
 * table behind this app, so the last step does not pretend to charge a
 * card. It confirms the order and hands it to a person, which is what
 * actually happens today, and says so plainly. The alternative — a
 * convincing "Pay now" button that silently does nothing — is the exact
 * kind of thing this page exists not to do.
 */

const STEP_LABELS = ["Address", "Delivery", "Payment", "Confirm"];

const GROUP_ICON: Record<FulfilmentType, typeof Clock> = {
  instant: Clock,
  scheduled: Truck,
  made_to_order: Ruler,
  bookable: Calendar,
};

type PaymentMethod = "callback" | "upi" | "card" | "cash";

/**
 * What Quoin can actually take today.
 *
 * `available: false` is not a tease — the methods are listed because a
 * customer deciding whether to order needs to know what will be possible,
 * and hiding them makes the one working option look like the only one
 * that will ever exist. They are visibly unavailable and cannot be
 * selected.
 */
const PAYMENT_METHODS: {
  id: PaymentMethod;
  title: string;
  detail: string;
  Icon: typeof Rupee;
  available: boolean;
}[] = [
  {
    id: "callback",
    title: "Confirm with an expert",
    detail:
      "Quoin calls back within the hour to take payment and lock your delivery slots.",
    Icon: Headset,
    available: true,
  },
  {
    id: "upi",
    title: "UPI",
    detail: "Arrives with the payments module.",
    Icon: Rupee,
    available: false,
  },
  {
    id: "card",
    title: "Card",
    detail: "Arrives with the payments module.",
    Icon: CreditCard,
    available: false,
  },
  {
    id: "cash",
    title: "Cash on delivery",
    detail: "Available on scheduled deliveries once orders go live.",
    Icon: Cart,
    available: false,
  },
];

export function CheckoutFlow({ isSignedIn }: { isSignedIn: boolean }) {
  const { lines, groups, ready, subtotalPaise } = useCart();

  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<Address | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("callback");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  /* Priced by the server the moment the cart is known, not at the last
     step: a customer should meet a price change on the first screen, when
     changing their mind is free. */
  useEffect(() => {
    if (!ready || lines.length === 0) return;
    let ignore = false;

    (async () => {
      try {
        const res = await fetch("/api/v1/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: lines.map((l) => ({
              productSlug: l.productSlug,
              variantId: l.variantId,
              qty: l.qty,
            })),
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data: Quote };
        if (!ignore) setQuote(body.data);
      } catch {
        if (!ignore) {
          setQuoteError(
            "We could not confirm today's prices. Refresh before you continue.",
          );
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [ready, lines]);

  if (!ready) return <ListSkeleton rows={3} />;

  if (placed) return <Placed />;

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<Cart className="size-6" />}
        title="There is nothing to check out"
        action={{ href: "/products", label: "Explore materials" }}
      >
        Add something to the cart and this page will price it, split it by how
        each item travels, and take it from there.
      </EmptyState>
    );
  }

  const total = quote?.subtotalPaise ?? subtotalPaise;
  const savings = quote?.savingsPaise ?? 0;

  const canAdvance =
    step === 0 ? isSignedIn && Boolean(address) : step === 3 ? false : true;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <div className="min-w-0 pb-4">
        <Steps steps={STEP_LABELS} current={step} className="mb-8" />

        {quoteError && (
          <div className="mb-4">
            <InlineError>{quoteError}</InlineError>
          </div>
        )}

        {quote?.changed && <QuoteChanges quote={quote} />}

        {step === 0 && (
          <StepPanel
            title="Where is it going?"
            detail="Serviceability and delivery time are decided on the exact spot, not the PIN code."
          >
            {isSignedIn ? (
              <AddressPicker
                selectedId={address?.id ?? null}
                onSelect={setAddress}
              />
            ) : (
              <div>
                <p className="mb-4 text-body-sm leading-relaxed text-muted">
                  Sign in to use a saved address. One number, one code — the
                  account is created the first time you verify.
                </p>
                <SignInPanel next="/checkout" />
              </div>
            )}
          </StepPanel>
        )}

        {step === 1 && (
          <StepPanel
            title="How it reaches you"
            detail="Your cart travels in separate shipments. Each keeps its own real promise."
          >
            <ul className="space-y-3">
              {groups.map((group) => {
                const Icon = GROUP_ICON[group.fulfilment];
                const promise = GROUP_PROMISE[group.fulfilment];
                const leadDays = group.lines.reduce(
                  (max, l) => Math.max(max, l.snapshot.leadTimeDays ?? 0),
                  0,
                );
                return (
                  <li
                    key={group.fulfilment}
                    className="flex gap-3 rounded-card border border-line-soft bg-surface p-4"
                  >
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-semibold text-ink">
                        {promise.title}
                      </p>
                      <p className="mt-0.5 text-caption leading-relaxed text-muted">
                        {promise.detail(leadDays || undefined)}
                      </p>
                      <p className="nums mt-2 text-micro text-faint">
                        {group.lines.length}{" "}
                        {group.lines.length === 1 ? "item" : "items"} ·{" "}
                        {formatPrice(group.subtotalPaise)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 flex items-start gap-2 text-micro leading-relaxed text-faint">
              <Alert className="mt-0.5 size-3.5 shrink-0" />
              Exact dates are confirmed when the order is placed — a slot is
              only real once the store and the driver are both held.
            </p>
          </StepPanel>
        )}

        {step === 2 && (
          <StepPanel
            title="How you would like to pay"
            detail="Quoin does not hold card details. Nothing is charged on this screen."
          >
            <ul className="space-y-2">
              {PAYMENT_METHODS.map((method) => {
                const on = method.id === payment;
                return (
                  <li key={method.id}>
                    <button
                      type="button"
                      disabled={!method.available}
                      onClick={() => setPayment(method.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors",
                        !method.available && "cursor-not-allowed opacity-55",
                        on && method.available
                          ? "border-accent bg-accent-wash"
                          : "border-line-soft bg-surface",
                        method.available && !on && "hover:border-line-strong",
                      )}
                    >
                      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-muted">
                        <method.Icon className="size-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body-sm font-semibold text-ink">
                            {method.title}
                          </span>
                          {!method.available && <Badge>Not yet</Badge>}
                        </span>
                        <span className="mt-1 block text-caption leading-relaxed text-muted">
                          {method.detail}
                        </span>
                      </span>
                      {on && method.available && (
                        <Check className="mt-1 size-4 shrink-0 text-accent" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </StepPanel>
        )}

        {step === 3 && (
          <StepPanel
            title="Check it over"
            detail="Prices below were confirmed against the catalogue moments ago."
          >
            <Review
              address={address}
              quote={quote}
              subtotalPaise={total}
              savingsPaise={savings}
              onPlace={() => setPlaced(true)}
            />
          </StepPanel>
        )}

        <div className="mt-6 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <Back className="size-4" />
              Back
            </Button>
          )}
          {step < 3 && (
            <Button
              className="ml-auto"
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <Card padding="lg" className="mt-8 hidden lg:sticky lg:top-24 lg:mt-0 lg:block">
        <OrderTotals
          subtotalPaise={total}
          savingsPaise={savings}
          lineCount={quote?.lines.length ?? lines.length}
        />
      </Card>

      <StickyBar>
        <div className="min-w-0 flex-1">
          <p className="nums text-title-sm font-semibold text-ink">
            {formatPrice(total)}
          </p>
          <p className="text-micro text-muted">
            Step {step + 1} of {STEP_LABELS.length} · {STEP_LABELS[step]}
          </p>
        </div>
        {step < 3 ? (
          <Button
            size="lg"
            className="shrink-0"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button size="lg" className="shrink-0" href="/consult">
            Confirm
          </Button>
        )}
      </StickyBar>
    </div>
  );
}

/* ----------------------------------------------------------------- parts */

function StepPanel({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="anim-rise">
      <h2 className="text-title font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-prose text-body-sm leading-relaxed text-muted">
        {detail}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * What moved since the browser last looked.
 *
 * Shown at the top of every step rather than only at review: the earlier a
 * customer sees a price change, the cheaper it is for them to walk away,
 * and a change discovered on the confirmation screen reads as a trick.
 */
function QuoteChanges({ quote }: { quote: Quote }) {
  const adjusted = quote.lines.filter((l) => l.issues.length > 0);

  return (
    <div className="mb-6 rounded-card border border-warning/25 bg-warning-wash p-4">
      <p className="flex items-center gap-2 text-body-sm font-semibold text-warning">
        <Alert className="size-4" />
        Some lines changed
      </p>
      <ul className="mt-2 space-y-1 text-caption text-muted">
        {quote.unavailable.map((line) => (
          <li key={line.variantId}>
            <span className="text-ink">{line.productSlug}</span> is no longer
            available and has been left out of the total.
          </li>
        ))}
        {adjusted.map((line) => (
          <li key={line.variantId}>
            <span className="text-ink">{line.title}</span> — quantity moved from{" "}
            <span className="nums">{line.requestedQty}</span> to{" "}
            <span className="nums">{line.qty}</span> to match how it is sold.
          </li>
        ))}
      </ul>
    </div>
  );
}

function Review({
  address,
  quote,
  subtotalPaise,
  savingsPaise,
  onPlace,
}: {
  address: Address | null;
  quote: Quote | null;
  subtotalPaise: number;
  savingsPaise: number;
  onPlace: () => void;
}) {
  return (
    <div className="space-y-5">
      {address && (
        <div className="rounded-card border border-line-soft bg-surface p-4">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted">
            Delivering to
          </p>
          <p className="mt-1.5 text-body-sm leading-relaxed text-ink">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}
            <br />
            {address.city}, {address.state}{" "}
            <span className="nums">{address.pincode}</span>
          </p>
        </div>
      )}

      {quote && quote.lines.length > 0 && (
        <ul className="divide-y divide-line-hair overflow-hidden rounded-card border border-line-soft bg-surface">
          {quote.lines.map((line) => (
            <li
              key={line.variantId}
              className="flex items-baseline gap-3 px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <Link
                  href={`/p/${line.productSlug}`}
                  className="line-clamp-1 text-body-sm text-ink hover:text-accent"
                >
                  {line.title}
                </Link>
                <span className="nums mt-0.5 block text-micro text-faint">
                  {line.variantLabel} · {formatPrice(line.unitPricePaise)} ×{" "}
                  {line.qty}
                </span>
              </span>
              <span className="nums shrink-0 text-body-sm font-semibold text-ink">
                {formatPrice(line.linePaise)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <OrderTotals
        subtotalPaise={subtotalPaise}
        savingsPaise={savingsPaise}
        lineCount={quote?.lines.length ?? 0}
      />

      <div className="rounded-card border border-accent-edge bg-accent-wash p-4">
        <p className="flex items-start gap-2 text-body-sm leading-relaxed text-ink">
          <Headset className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            Quoin cannot take card payments yet, so this order is confirmed by
            a person: press below and an expert calls back within the hour to
            take payment and lock your delivery slots.
          </span>
        </p>
        <Button block size="lg" className="mt-4" onClick={onPlace}>
          Confirm this order
        </Button>
      </div>
    </div>
  );
}

function OrderTotals({
  subtotalPaise,
  savingsPaise,
  lineCount,
}: {
  subtotalPaise: number;
  savingsPaise: number;
  lineCount: number;
}) {
  return (
    <div>
      <h2 className="text-title-sm font-semibold text-ink">Order total</h2>
      <dl className="mt-4 space-y-2 text-body-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">
            Items <span className="nums text-faint">({lineCount})</span>
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
          <dd className="text-micro text-faint">Confirmed on the call</dd>
        </div>
        <div className="flex justify-between gap-3">
          {/* Named rather than guessed. Construction materials span four GST
              slabs and the catalogue carries no rate column; one assumed
              percentage would be wrong for most of a mixed basket. */}
          <dt className="text-muted">GST</dt>
          <dd className="text-micro text-faint">Added on the invoice</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line-hair pt-4">
        <span className="text-body font-semibold text-ink">Payable</span>
        <span className="nums text-title font-semibold text-ink">
          {formatPrice(subtotalPaise)}
        </span>
      </div>
    </div>
  );
}

function Placed() {
  return (
    <div className="anim-rise mx-auto max-w-md text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-wash text-success">
        <CheckCircle className="size-7" />
      </span>
      <h2 className="mt-5 text-headline font-semibold text-ink">
        Your order is with us
      </h2>
      <p className="mt-3 text-body leading-relaxed text-muted">
        An expert calls back within the hour to take payment and confirm each
        delivery date. Your cart stays exactly as it is until then.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button href="/projects">Track it in a project</Button>
        <Button href="/products" variant="outline">
          Keep browsing
        </Button>
      </div>
    </div>
  );
}
