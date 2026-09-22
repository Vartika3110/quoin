import type { OrderStatus } from "@prisma/client";
import { moneyMoved } from "@/lib/orders/status-groups";

/**
 * What the confirmation screen says, worked out from what is actually
 * known rather than from what just happened in the browser.
 *
 * Pure on purpose: `CheckoutFlow` decides *when* each of these inputs is
 * true (a Razorpay handoff verified, a poll came back, ten polls came
 * back with nothing), and this function only ever turns a settled set of
 * facts into copy — so every combination is testable without a component,
 * a fetch mock or a clock.
 *
 * `status` is typed as a bare string, not `OrderStatus`, because it can
 * arrive from two different places with two different shapes: the
 * `/checkout/verify` response's `status` field (already `OrderStatus` on
 * the wire) and, before that response comes back or when it never does,
 * simply `null`. `moneyMoved` is still the single source of truth for
 * "has this paid" — a status this function does not recognise is treated
 * as not yet moved, never as an error.
 */
export interface ConfirmationCopyInput {
  kind: "online" | "callback";
  /** Shown separately, in its own mono line — see `OrderPlaced` — but
      still threaded through here because several messages are honest
      only with it named inline. */
  reference: string;
  /** `Order.status` as last read back, or `null` before anything has. */
  status: string | null;
  /** Whether the browser's own Razorpay handoff checked out. Never proof
      of payment on its own — see `/checkout/verify` — only ever a reason
      to sound more confident while the webhook, elsewhere, does the part
      that actually counts. */
  verified: boolean;
  /** Whether the status poll below gave up without ever seeing the order
      move to a paid status. */
  pollingExhausted: boolean;
}

export type ConfirmationTone = "success" | "pending" | "warning";

export interface ConfirmationCopy {
  tone: ConfirmationTone;
  heading: string;
  detail: string;
}

export function confirmationCopy(input: ConfirmationCopyInput): ConfirmationCopy {
  const { kind, reference, status, verified, pollingExhausted } = input;

  if (kind === "callback") {
    /* No gateway was ever involved, so there is nothing to verify and
       nothing to poll — the order itself is the whole outcome. Copy is
       unchanged from before this screen existed: an honest promise about
       a callback, and no invented time beyond "within the hour". */
    return {
      tone: "success",
      heading: "Your order is with us",
      detail: `Order ${reference} is saved. An expert calls back within the hour to take payment and confirm each delivery date — have this reference ready. Nothing has been charged yet.`,
    };
  }

  if (status != null && moneyMoved(status as OrderStatus)) {
    return {
      tone: "success",
      heading: "Payment successful",
      detail: `Order ${reference} is paid.`,
    };
  }

  if (!verified) {
    /* The handoff itself did not check out — a forged or replayed body
       is indistinguishable from a genuine one except by the HMAC, so a
       failure here says nothing about whether money moved. The order
       exists regardless (it was written before the modal ever opened),
       so the reference is still shown, just without the confidence a
       verified handoff would have earned. */
    return {
      tone: "warning",
      heading: "We couldn't confirm your payment yet",
      detail: `Order ${reference} is saved. We could not confirm the payment immediately — check your orders shortly, and if it still looks unpaid, contact support with this reference.`,
    };
  }

  if (pollingExhausted) {
    /* Ten polls at three seconds is half a minute — comfortably past a
       webhook's usual latency, but not proof the webhook failed. The
       order's own status keeps updating on its own after this screen is
       gone; this is the moment to say so rather than to keep spinning. */
    return {
      tone: "pending",
      heading: "Payment is being confirmed",
      detail:
        "Your order is saved and its status updates on its own in your orders. If it still shows unpaid in a few minutes, contact support with this reference.",
    };
  }

  return {
    tone: "pending",
    heading: "Payment received — confirming your order",
    detail: "This usually finishes within moments.",
  };
}
