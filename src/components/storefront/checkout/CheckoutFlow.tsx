"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Steps } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/ErrorState";
import { CheckRow, Field, Input } from "@/components/ui/Input";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { StickyBar } from "@/components/storefront/StickyBar";
import { SignInPanel } from "@/components/storefront/auth/SignInPanel";
import {
  AddressPicker,
  type Address,
} from "@/components/storefront/checkout/AddressPicker";
import { OrderPlaced, type PlacedState } from "@/components/storefront/checkout/OrderPlaced";
import { cn } from "@/components/ui/cn";
import {
  Alert,
  ArrowRight,
  Back,
  Calendar,
  Cart,
  Check,
  Clock,
  CreditCard,
  Headset,
  Phone,
  Rupee,
  Ruler,
  Truck,
} from "@/components/icons";
import { GROUP_PROMISE, useCart } from "@/lib/store/cart";
import { formatPrice, type FulfilmentType } from "@/lib/types/catalog";
import type { Quote } from "@/lib/data/checkout";
import { basketKey } from "@/components/storefront/checkout/idempotency";
import { track } from "@/lib/analytics";

/**
 * Checkout.
 *
 * Four steps, one screen at a time, because a checkout that shows
 * everything at once is a checkout people abandon on a phone. The step
 * indicator is not decoration: it is the thing that makes a form feel
 * bounded.
 *
 * Three decisions worth naming:
 *
 * **The cart is re-priced by the server before anything else happens.**
 * The browser's snapshot is for drawing quickly; it can be stale, and it
 * can be edited. `/api/v1/checkout/quote` prices every line again against
 * the live catalogue and reports what moved, and any movement is shown to
 * the customer before they continue. A checkout that discovers a price
 * change after payment is a refund.
 *
 * **Placing an order and taking payment are two different requests.**
 * `POST /api/v1/checkout/order` always writes a real, server-priced
 * order — for online payment it also writes a Razorpay order against it,
 * and the browser only ever opens Razorpay's own modal with the ids that
 * call returned; for a callback order the same call returns with no
 * gateway involved at all, because nobody is being asked to pay yet.
 * Nothing in this file states an amount to the gateway — it states an
 * `orderId` the gateway already agreed the amount for.
 *
 * **This screen never marks anything paid.** The modal's own success
 * callback is a claim from the customer's browser, not proof money moved,
 * so it is only ever used to open a hopeful confirmation screen while
 * `POST /api/v1/checkout/verify` — itself not authoritative either — checks
 * the handoff was genuine. Only the Razorpay webhook, elsewhere entirely,
 * moves an order to PAID.
 */

const STEP_LABELS = ["Address", "Delivery", "Payment", "Confirm"];

const GROUP_ICON: Record<FulfilmentType, typeof Clock> = {
  instant: Clock,
  scheduled: Truck,
  made_to_order: Ruler,
  bookable: Calendar,
};

/**
 * `upi` and `card` remain as ids only so an already-disabled tile keeps a
 * stable key when payments are not configured; neither is ever a
 * selectable value once `online` exists. See `paymentMethods` below.
 */
type PaymentMethod = "callback" | "upi" | "card" | "online" | "cash";

interface PaymentMethodDef {
  id: PaymentMethod;
  title: string;
  detail: string;
  Icon: typeof Rupee;
  available: boolean;
}

/**
 * What Quoin can actually take, given whether Razorpay is configured.
 *
 * `available: false` is not a tease — the methods are listed because a
 * customer deciding whether to order needs to know what will be possible,
 * and hiding them makes the one working option look like the only one
 * that will ever exist. They are visibly unavailable and cannot be
 * selected.
 *
 * Unconfigured is byte-for-byte today's list and copy — payments being
 * unreachable (KYC pending, keys not yet issued) must look exactly like it
 * always has, not like a broken checkout. Configured collapses UPI, card
 * and netbanking into one tile, because they are the same Razorpay modal
 * and presenting three buttons that all open one screen is the dishonest
 * option, not the plain one.
 */
function paymentMethods(configured: boolean): PaymentMethodDef[] {
  if (!configured) {
    return [
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
  }

  return [
    {
      id: "callback",
      title: "Confirm with an expert",
      detail:
        "Quoin calls back within the hour to take payment and lock your delivery slots.",
      Icon: Headset,
      available: true,
    },
    {
      id: "online",
      title: "UPI, card or netbanking",
      detail:
        "One secure Razorpay screen — pick UPI, card or netbanking once it opens. Nothing is charged until you complete it there.",
      Icon: CreditCard,
      available: true,
    },
    {
      id: "cash",
      title: "Cash on delivery",
      detail: "Nothing on this side takes cash payments yet.",
      Icon: Cart,
      available: false,
    },
  ];
}

/** ---- Razorpay's checkout script ------------------------------------------
 *
 * Loaded lazily, on reaching the payment step, and only when a gateway
 * order will actually exist for it to open — never from the root layout,
 * where every visitor would pay for a third-party script whether or not
 * they ever reach checkout.
 */
const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only load in the browser."));
  }
  if (window.Razorpay) return Promise.resolve();

  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        /* Let the next attempt try again instead of remembering a network
           blip forever as a permanent failure. */
        razorpayScriptPromise = null;
        reject(
          new Error(
            "We could not reach the payment gateway. Check your connection and try again.",
          ),
        );
      };
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

interface RazorpayHandoff {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  handler: (response: RazorpayHandoff) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/** The shape `POST /api/v1/checkout/order` answers with on success. */
interface OrderPlacedResponse {
  reference: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  quote: Quote;
  /** What to branch on — never inferred from `razorpay` being null. */
  paymentMode: "online" | "callback";
  razorpay: {
    orderId: string;
    keyId: string | null;
    amountPaise: number;
    currency: string;
  } | null;
}

/** The shape `POST /api/v1/checkout/verify` answers with on success. */
interface VerifyResponse {
  reference: string;
  status: string;
}

/**
 * What the confirmation screen shows.
 *
 * Both kinds now carry a real order reference. `callback` used to be
 * local-only state — nothing was ever written, see the removed 409 guard
 * this used to trip in `route.ts` — and now goes through the same
 * `POST /api/v1/checkout/order` call as `online`, just with no gateway
 * involved and so no `Payment` row. `online`'s order was written the
 * moment "Pay" was pressed, before Razorpay's modal ever opened, and
 * `verified`/`status` are what make its copy honest rather than
 * optimistic. See `OrderPlaced`, which owns the type.
 */

export function CheckoutFlow({
  isSignedIn,
  needsContactPhone,
  savedDeliveryPhone,
  paymentsConfigured,
  googleEnabled,
  smsEnabled,
}: {
  isSignedIn: boolean;
  /** Signed in with no verified `User.phone` and no saved `User.deliveryPhone`
      — a Google account before checkout, or Settings, has ever given one.
      Drives the mobile-number field on the address step; see
      `POST /api/v1/checkout/order`'s `contactPhone`. */
  needsContactPhone: boolean;
  /** A previously saved delivery number, masked — shown in place of the
      field above when there is nothing left to ask. Always null when
      `needsContactPhone` is true. */
  savedDeliveryPhone: string | null;
  paymentsConfigured: boolean;
  googleEnabled: boolean;
  smsEnabled: boolean;
}) {
  const { lines, groups, ready, subtotalPaise, clear } = useCart();

  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<Address | null>(null);
  const [contactPhone, setContactPhone] = useState("");
  const [contactPhoneError, setContactPhoneError] = useState<string | null>(null);
  /* Set only by pressing Continue with something outstanding. See
     `blocker` and `advance` below for why this is not a disabled
     button. */
  const [advanceAttempted, setAdvanceAttempted] = useState(false);
  const stepZeroRef = useRef<HTMLDivElement>(null);
  /* Checked by default: a customer who is typing this in specifically so
     Quoin can reach them almost always wants it remembered, and unchecking
     one box is a lighter ask than checking one — see the order route for
     what "saved" actually means (`saveContactPhone`, ignored whenever a
     verified or already-saved number exists). */
  const [saveContactPhone, setSaveContactPhone] = useState(true);
  const [payment, setPayment] = useState<PaymentMethod>(
    paymentsConfigured ? "online" : "callback",
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placedState, setPlacedState] = useState<PlacedState | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  /* One entry, replaced whenever the basket or address actually changes —
     see `basketKey`. Not component state: changing it must never trigger
     a re-render, it only has to be read at the moment an order is placed. */
  const idempotencyRef = useRef<{ basketKey: string; key: string } | null>(null);
  function idempotencyKeyFor(addressId: string): string {
    const key = basketKey(addressId, lines);
    if (idempotencyRef.current?.basketKey !== key) {
      idempotencyRef.current = { basketKey: key, key: crypto.randomUUID() };
    }
    return idempotencyRef.current.key;
  }

  /* Fired once per visit to this screen with something to check out, not
     once per render of it: `lines` is a new array on every cart read, so
     gating on a ref rather than re-deriving "have I already sent this"
     from state is what keeps a re-render from ever counting as a second
     checkout starting. */
  const checkoutStartedFiredRef = useRef(false);
  useEffect(() => {
    if (!ready || lines.length === 0 || checkoutStartedFiredRef.current) return;
    checkoutStartedFiredRef.current = true;
    track("checkout_started", { itemCount: lines.length, subtotalPaise });
  }, [ready, lines, subtotalPaise]);

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

  /* Fetched once the customer is on or past the payment step — not
     sooner, so a visitor who never gets this far never pays for it. */
  useEffect(() => {
    if (!paymentsConfigured || step < 2) return;
    loadRazorpayScript().catch(() => {
      /* Swallowed here on purpose: a genuine failure surfaces again,
         loudly, when `placeOrder` awaits this same promise at the
         moment it actually matters. This is only a prefetch. */
    });
  }, [paymentsConfigured, step]);

  /**
   * Writes the order and, for online payment, gets a Razorpay order back
   * and opens the modal. For a callback order there is nothing further to
   * do: the order already exists, `PENDING_PAYMENT` with no `Payment`
   * row, and that row is exactly what an expert calling back works from.
   *
   * Placing and paying are deliberately not one step the way the button
   * makes them look: by the time the modal opens — or the callback
   * confirmation shows — a real `PENDING_PAYMENT` order already exists,
   * under the idempotency key this checkout attempt has been using
   * throughout. A closed modal, a declined card, a lost connection, or a
   * double-tapped Confirm from here on leaves that order exactly where it
   * is — nothing here can create a second one for the same attempt.
   */
  async function placeOrder() {
    if (!address) return;

    setOrderError(null);
    setContactPhoneError(null);
    setPlacing(true);

    try {
      let res: Response;
      try {
        res = await fetch("/api/v1/checkout/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addressId: address.id,
            lines: lines.map((l) => ({
              productSlug: l.productSlug,
              variantId: l.variantId,
              qty: l.qty,
            })),
            idempotencyKey: idempotencyKeyFor(address.id),
            paymentMode: payment === "online" ? "online" : "callback",
            /* Only meaningful when the account has no phone of its own —
               see `needsContactPhone`. Sent regardless of that flag is
               harmless too: the route ignores both whenever a verified or
               already-saved number exists. */
            ...(needsContactPhone ? { contactPhone, saveContactPhone } : {}),
          }),
        });
      } catch {
        /* The request never reached the server at all — a dropped Wi-Fi,
           not a rejection from it. The idempotency key above already
           guarantees a retry cannot double-write the order, so the fix is
           just to say that and let the same press-Pay path run again,
           rather than the generic message below, which reads as "did
           this even go through?" precisely when it did not. */
        throw new Error(
          "Connection lost before we heard back. Press Pay again — it won't create a second order.",
        );
      }
      const body = (await res.json()) as {
        data?: OrderPlacedResponse;
        error?: { message: string; fields?: Record<string, string> };
      };
      if (!res.ok || !body.data) {
        if (body.error?.fields?.contactPhone) {
          /* The field lives on the address step, not this one — send the
             customer back to it rather than leaving the error stranded on
             a review screen with no matching input. */
          setContactPhoneError(body.error.fields.contactPhone);
          setStep(0);
          setPlacing(false);
          return;
        }
        throw new Error(
          body.error?.message ?? "We could not place this order. Please try again.",
        );
      }

      const order = body.data;

      /* Surfaced the same way the pre-checkout quote is: this request
         re-priced the basket one more time, against the catalogue at the
         exact moment it became an order, and this may be the request that
         discovers a move. */
      if (order.quote.changed) setQuote(order.quote);

      if (order.paymentMode === "callback") {
        /* No gateway, no modal — the order itself is the whole outcome.
           The basket is now that order, so it is emptied here; leaving it
           full invites the same items being ordered a second time. */
        setPlacing(false);
        clear();
        setPlacedState({ kind: "callback", reference: order.reference });
        return;
      }

      if (!order.razorpay?.keyId) {
        /* Should not happen — the order route checks this before it will
           even write the order — but a null key building a Razorpay
           modal is a broken screen, not a bug worth 500-ing over. */
        throw new Error(
          "Online payment is not available right now. Please try again shortly.",
        );
      }

      await loadRazorpayScript();
      if (!window.Razorpay) {
        throw new Error("We could not load the payment screen. Please try again.");
      }

      /* Scoped to this one Razorpay instance rather than a component-level
         ref: a fresh `rzp` — and so a fresh `handoffHandled` — is created
         every time `placeOrder` runs, which is exactly the "press Pay
         again" path. What this guards against is Razorpay itself calling
         `handler` twice for the *same* instance, which it has been known
         to do on a slow or flaky close; a second call must not open a
         second `/checkout/verify` race against the first. */
      let handoffHandled = false;

      const rzp = new window.Razorpay({
        key: order.razorpay.keyId,
        order_id: order.razorpay.orderId,
        amount: order.razorpay.amountPaise,
        currency: order.razorpay.currency,
        name: "Quoin",
        description: `Order ${order.reference}`,
        handler: (response) => {
          if (handoffHandled) return;
          handoffHandled = true;
          void confirmHandoff(response, order.reference);
        },
        modal: {
          ondismiss: () => {
            /* Not an error — the order still exists as PENDING_PAYMENT
               under the same idempotency key, so pressing Pay again
               reuses it rather than writing a second order and a second
               gateway order for the same attempt. */
            setPlacing(false);
            setOrderError(
              `Payment window closed before finishing. Order ${order.reference} is saved — press Pay again to retry.`,
            );
            track("payment_failed", { reference: order.reference, reason: "dismissed" });
          },
        },
      });

      rzp.on("payment.failed", () => {
        setPlacing(false);
        setOrderError(
          `The payment did not go through. Order ${order.reference} is saved — press Pay again to retry.`,
        );
        track("payment_failed", { reference: order.reference, reason: "failed" });
      });

      track("payment_started", {
        reference: order.reference,
        amountPaise: order.razorpay.amountPaise,
      });
      rzp.open();
    } catch (error) {
      setPlacing(false);
      setOrderError(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
      );
    }
  }

  /**
   * Runs after the modal closes on what Razorpay's own side calls a
   * success. Never treated as payment proof — see the module doc comment
   * — only as a reason to check `/checkout/verify` and show its answer.
   */
  async function confirmHandoff(response: RazorpayHandoff, reference: string) {
    /* Emptied on Razorpay's success handoff, before verification, and not
       on dismiss or `payment.failed`: those keep the basket so "press Pay
       again" still has something to pay for. Once the customer has paid,
       a full basket is only a way to buy the same things twice — whether
       or not `/checkout/verify` answers in time. */
    clear();
    try {
      const res = await fetch("/api/v1/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        }),
      });
      const body = (await res.json()) as { data?: VerifyResponse };
      if (res.ok && body.data) {
        setPlacedState({
          kind: "online",
          reference: body.data.reference,
          status: body.data.status,
          verified: true,
        });
        return;
      }
    } catch {
      // Falls through to the unverified state below.
    }

    /* The order exists regardless — it was written before the modal ever
       opened — so the reference is still shown. Only the *confidence* of
       the copy changes; see `OrderPlaced`. */
    track("payment_failed", { reference, reason: "unverified" });
    setPlacedState({ kind: "online", reference, status: null, verified: false });
  }

  if (!ready) return <ListSkeleton rows={3} />;

  if (placedState) return <OrderPlaced state={placedState} />;

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

  /**
   * What is stopping this step, in the customer's words.
   *
   * Continue used to be `disabled` whenever this was non-null, which is
   * how a form tells somebody nothing at all: they press the only button
   * on the screen, the page does not move, and there is no text anywhere
   * saying why. On a phone the button is in a sticky bar at the bottom
   * and the missing field is off-screen above it, so there is not even a
   * greyed-out box to look at and infer from.
   *
   * So the button stays live and pressing it *answers the question*. The
   * message is derived rather than stored, which means it disappears by
   * itself the moment the customer fixes the thing — an error that
   * outlives its cause is read as a second, new failure.
   */
  const blocker: { message: string; focus?: "address" | "phone" } | null =
    step !== 0
      ? null
      : !isSignedIn
        ? { message: "Sign in above to continue — your delivery addresses live on your account." }
        : !address
          ? { message: "Choose where this is going.", focus: "address" }
          : needsContactPhone && contactPhone.trim().length === 0
            ? {
                message: "Add a mobile number so the driver or store can reach you.",
                focus: "phone",
              }
            : null;

  function advance() {
    if (blocker) {
      setAdvanceAttempted(true);
      if (blocker.focus === "phone") {
        setContactPhoneError(blocker.message);
        document.getElementById("contact-phone")?.focus();
      } else if (blocker.focus === "address") {
        /* Scrolled to rather than focused: the picker is a list of
           cards, and there is no one control to put a cursor in. */
        stepZeroRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }
    setAdvanceAttempted(false);
    setStep((s) => s + 1);
  }

  /* Truthful for whichever sign-in methods are actually live — mirrors
     `/signin`'s own subtitle logic (`src/app/signin/page.tsx`) so the two
     screens never make different claims about what is possible right now. */
  const checkoutSignInCopy =
    googleEnabled && smsEnabled
      ? "Sign in to use a saved address — continue with Google, or with one number and one code."
      : smsEnabled
        ? "Sign in to use a saved address. One number, one code — the account is created the first time you verify."
        : googleEnabled
          ? "Sign in with Google to use a saved address."
          : "Sign-in isn't available yet, so a saved address can't be used right now.";

  const online = payment === "online";
  const confirmAction = placeOrder;
  const confirmLabel = online ? `Pay ${formatPrice(total)}` : "Confirm";

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
              <div className="space-y-5">
                <div ref={stepZeroRef}>
                  <AddressPicker
                    selectedId={address?.id ?? null}
                    onSelect={setAddress}
                  />
                </div>
                {needsContactPhone ? (
                  <div>
                    <Field
                      label="Mobile number"
                      htmlFor="contact-phone"
                      hint="Indian numbers only, with or without +91. Needed so a driver or store can reach you — Google did not give Quoin one."
                      error={contactPhoneError}
                      required
                    >
                      <Input
                        id="contact-phone"
                        name="contactPhone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="98765 43210"
                        value={contactPhone}
                        onChange={(e) => {
                          setContactPhone(e.target.value);
                          if (contactPhoneError) setContactPhoneError(null);
                        }}
                        leading={<Phone className="size-4" />}
                        aria-invalid={contactPhoneError ? true : undefined}
                      />
                    </Field>
                    <CheckRow
                      className="mt-2"
                      label="Save this number for future deliveries"
                      checked={saveContactPhone}
                      onChange={(e) => setSaveContactPhone(e.target.checked)}
                    />
                  </div>
                ) : (
                  savedDeliveryPhone && (
                    <p className="text-caption text-muted">
                      Deliveries to <span className="nums text-ink">{savedDeliveryPhone}</span> ·{" "}
                      <Link href="/account/settings" className="text-accent">
                        Change in settings
                      </Link>
                    </p>
                  )
                )}
              </div>
            ) : (
              <div>
                <p className="mb-4 text-body-sm leading-relaxed text-muted">
                  {checkoutSignInCopy}
                </p>
                <SignInPanel
                  next="/checkout"
                  googleEnabled={googleEnabled}
                  smsEnabled={smsEnabled}
                />
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
            detail={
              paymentsConfigured
                ? "Quoin does not hold card details. Payment happens on Razorpay's own screen."
                : "Quoin does not hold card details. Nothing is charged on this screen."
            }
          >
            <ul className="space-y-2">
              {paymentMethods(paymentsConfigured).map((method) => {
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
              online={online}
              placing={placing}
              orderError={orderError}
              onConfirm={confirmAction}
              confirmLabel={confirmLabel}
            />
          </StepPanel>
        )}

        {/* Rendered only while the reason is still true, so fixing the
            field clears the message without anything having to remember
            to clear it. */}
        {advanceAttempted && blocker && (
          <div className="mt-4">
            <InlineError>{blocker.message}</InlineError>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <Back className="size-4" />
              Back
            </Button>
          )}
          {/* Desktop only: below `lg` the sticky bar carries Continue, and
              rendering this one too puts the same action on screen twice.
              Back stays at every width — the bar has no room for it.

              Hidden on a wrapper, not on the Button: `hidden` on the Button
              itself loses to its own `inline-flex`, which Tailwind emits
              later in the stylesheet. */}
          {step < 3 && (
            <div className="ml-auto hidden lg:block">
              <Button onClick={advance}>
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </div>
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
          <Button size="lg" className="shrink-0" onClick={advance}>
            Continue
          </Button>
        ) : (
          <Button
            size="lg"
            className="shrink-0"
            loading={placing}
            disabled={placing}
            onClick={confirmAction}
          >
            {confirmLabel}
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
      <h2 className="font-display text-title font-semibold text-ink">{title}</h2>
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
  online,
  placing,
  orderError,
  onConfirm,
  confirmLabel,
}: {
  address: Address | null;
  quote: Quote | null;
  subtotalPaise: number;
  savingsPaise: number;
  online: boolean;
  placing: boolean;
  orderError: string | null;
  onConfirm: () => void;
  confirmLabel: string;
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

      {orderError && <InlineError>{orderError}</InlineError>}

      {online ? (
        <div className="rounded-card border border-accent-edge bg-accent-wash p-4">
          <p className="flex items-start gap-2 text-body-sm leading-relaxed text-ink">
            <CreditCard className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              Payment opens in a secure Razorpay window — UPI, card or
              netbanking, whichever you choose there. Your order is created
              the moment you press Pay; nothing is charged until you finish
              in that window.
            </span>
          </p>
          {/* Desktop only, like the step buttons: below `lg` the sticky
              bar already carries this action. Hidden on the wrapper for the
              same reason. */}
          <div className="mt-4 hidden lg:block">
            <Button block size="lg" loading={placing} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-card border border-accent-edge bg-accent-wash p-4">
          <p className="flex items-start gap-2 text-body-sm leading-relaxed text-ink">
            <Headset className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              Quoin cannot take card payments yet, so this order is confirmed by
              a person: press below and an expert calls back within the hour to
              take payment and lock your delivery slots.
            </span>
          </p>
          <div className="mt-4 hidden lg:block">
            <Button block size="lg" loading={placing} onClick={onConfirm}>
              Confirm this order
            </Button>
          </div>
        </div>
      )}
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
      <h2 className="font-display text-title-sm font-semibold text-ink">Order total</h2>
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
          {/* `Order.deliveryFeePaise` exists and is zero on every order —
              there is no rate schedule, no free-delivery threshold and no
              zone pricing anywhere in this codebase, and inventing one
              here would put a fabricated charge in front of a customer.
              "Not charged" is what is literally true today; it is not a
              promise about tomorrow. */}
          <dt className="text-muted">Delivery</dt>
          <dd className="text-micro text-faint">Not charged</dd>
        </div>
        <div className="flex justify-between gap-3">
          {/* Named rather than totalled. Construction materials span four
              GST slabs, so there is no single percentage to print against a
              mixed basket. The per-line figures do exist — `Product.gstRatePct`
              feeds `taxForLine`, and the order stores the sum — but this
              screen has no order yet, so it states the relationship rather
              than an amount it cannot compute. */}
          <dt className="text-muted">GST</dt>
          <dd className="text-micro text-faint">Included in total</dd>
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

