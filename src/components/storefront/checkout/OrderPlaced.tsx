"use client";

import { useEffect, useRef, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";
import { Alert, CheckCircle } from "@/components/icons";
import { AddOrderToProject } from "@/components/storefront/projects/AddOrderToProject";
import { confirmationCopy } from "@/components/storefront/checkout/confirmation-copy";
import { moneyMoved } from "@/lib/orders/status-groups";
import { track } from "@/lib/analytics";

/**
 * What the checkout hands this screen.
 *
 * Both kinds carry a real order reference — see the module doc comment on
 * `CheckoutFlow` for why `callback` is no longer local-only state. `online`
 * additionally carries what `/checkout/verify` answered: `status` is
 * whatever `Order.status` was at that moment (often still
 * `PENDING_PAYMENT`, since the webhook can genuinely lag this screen by a
 * few seconds) and `verified` is whether the browser's own handoff — not
 * proof of payment, see `confirmHandoff` — checked out at all.
 */
export type PlacedState =
  | { kind: "callback"; reference: string }
  | { kind: "online"; reference: string; status: string | null; verified: boolean };

/** How often, and how many times, to ask whether the webhook has landed
    yet — see the module comment below for why this exists at all. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 10;

/**
 * The confirmation screen.
 *
 * `confirmationCopy` (pure, tested on its own) turns `kind`/`status`/
 * `verified`/`pollingExhausted` into what the screen says. This component's
 * only job is to keep those four inputs honest as time passes — polling
 * `GET /api/v1/orders/{reference}` for an online order that verified but
 * has not yet shown up as paid, because the alternative is a screen frozen
 * on "confirming" long after the webhook already settled it.
 *
 * Never a second door to PAID: this only ever *reads* `Order.status`,
 * exactly like `/checkout/verify` does, and stops after ten tries rather
 * than polling forever — at that point the order's own page (and its own
 * notification, once the webhook lands) is what keeps telling the
 * customer, not a tab they may well have already closed.
 */
export function OrderPlaced({ state }: { state: PlacedState }) {
  /* Pulled out once, rather than re-narrowed by `state.kind === "online"`
     at every use below: a plain `state.verified` in a dependency array
     does not narrow the union the way it does inside an `if`, so the
     effects further down read these instead of the discriminated field
     directly. A `callback` order is always treated as already verified
     and past polling — there is no gateway handoff to verify and nothing
     for the poll below to wait on. */
  const onlineStatus = state.kind === "online" ? state.status : null;
  const onlineVerified = state.kind === "online" ? state.verified : true;

  const [liveStatus, setLiveStatus] = useState<string | null>(onlineStatus);
  const [pollingExhausted, setPollingExhausted] = useState(false);
  const projectSectionRef = useRef<HTMLDivElement>(null);
  /* Guards `payment_success` to one firing per screen — the effect below
     re-evaluates on every `liveStatus` change, and a poll landing exactly
     as the component re-renders for an unrelated reason must not count
     as a second success. */
  const paymentSuccessFiredRef = useRef(false);

  useEffect(() => {
    if (state.kind !== "online" || !onlineVerified) return;
    /* Already paid at the moment this screen was handed the verified
       handoff — the common case when the webhook beat the browser back
       from Razorpay's modal. Nothing to poll for. */
    if (onlineStatus != null && moneyMoved(onlineStatus as OrderStatus)) return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      attempts += 1;
      try {
        const res = await fetch(`/api/v1/orders/${state.reference}`);
        const body = (await res.json().catch(() => null)) as
          | { data?: { order?: { status?: string } } }
          | null;
        const status = body?.data?.order?.status;
        if (!cancelled && status) {
          setLiveStatus(status);
          if (moneyMoved(status as OrderStatus)) return; // Landed — stop polling.
        }
      } catch {
        /* A single failed poll is a network blip, not news — the retry
           budget below is exactly what absorbs it. Nothing is shown to
           the customer for one missed tick. */
      }
      if (cancelled) return;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        setPollingExhausted(true);
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.kind, state.reference, onlineVerified, onlineStatus]);

  useEffect(() => {
    if (state.kind !== "online" || paymentSuccessFiredRef.current) return;
    if (liveStatus != null && moneyMoved(liveStatus as OrderStatus)) {
      paymentSuccessFiredRef.current = true;
      track("payment_success", { reference: state.reference, verified: onlineVerified });
    }
  }, [state.kind, state.reference, onlineVerified, liveStatus]);

  const copy = confirmationCopy({
    kind: state.kind,
    reference: state.reference,
    status: state.kind === "online" ? liveStatus : null,
    verified: onlineVerified,
    pollingExhausted: state.kind === "online" && pollingExhausted,
  });

  const TONE_CLASS = {
    success: "bg-success-wash text-success",
    pending: "bg-accent-wash text-accent",
    warning: "bg-warning-wash text-warning",
  } as const;

  return (
    <div className="anim-rise mx-auto max-w-md text-center">
      <span
        className={cn(
          "mx-auto grid size-14 place-items-center rounded-full",
          TONE_CLASS[copy.tone],
        )}
      >
        {copy.tone === "pending" ? (
          <Spinner className="size-6" label="Confirming payment" />
        ) : copy.tone === "warning" ? (
          <Alert className="size-7" />
        ) : (
          <CheckCircle className="size-7" />
        )}
      </span>

      <h2 className="font-display mt-5 text-headline font-semibold text-ink">
        {copy.heading}
      </h2>
      <p className="mt-3 text-body leading-relaxed text-muted">{copy.detail}</p>
      <p className="nums mt-4 text-body-sm font-semibold text-ink">
        Order {state.reference}
      </p>
      {/* No date exists at order creation — nothing behind this app
          schedules a slot yet, see docs/design-system.md — so this states
          the relationship, never a fabricated day. */}
      <p className="mt-1 text-caption text-muted">
        Estimated delivery: Date confirmed on call
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button href={`/account/orders/${state.reference}#timeline`} variant="outline">
          Track Order
        </Button>
        <Button href={`/account/orders/${state.reference}`} variant="outline">
          View Order
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            projectSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          Add to Project
        </Button>
        <Button href="/products">Continue Shopping</Button>
      </div>

      {copy.tone === "warning" && (
        <p className="mt-4 text-caption text-muted">
          <a
            href={`/account/support?order=${state.reference}&category=payments`}
            className="font-medium text-accent"
          >
            Get help with this payment
          </a>
        </p>
      )}

      <div ref={projectSectionRef} className="mt-8 text-left">
        <AddOrderToProject reference={state.reference} />
      </div>
    </div>
  );
}
