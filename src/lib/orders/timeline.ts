import type { OrderStatus } from "@prisma/client";
import { stageForStatus, type OrderStage } from "@/lib/orders/lifecycle";

/**
 * The customer-facing order timeline.
 *
 * Four steps, and only four:
 *
 *   Order placed → Dispatched → Out for delivery → Delivered
 *
 * `src/lib/data/orders.ts` still owns the real lifecycle table
 * (`ORDER_TRANSITIONS`) and `src/lib/orders/lifecycle.ts` owns the
 * mapping from its twelve statuses onto the four stages above. This
 * module is the third, narrowest layer: it turns one order's status and
 * history into a stepper, so the order detail page and anything else that
 * ever wants the same stepper compute it identically rather than each
 * hand-rolling a slightly different reading of the same table.
 *
 * It used to be six steps, with "Payment confirmed" between placed and
 * confirmed, and "Packed" after it. Both are gone. `CONFIRMED`,
 * `PROCESSING` and `PACKED` are retired statuses (see
 * `RETIRED_FULFILMENT_STATUSES`) — there is no accept, prepare or ready
 * step any more — and a separate payment step was always a half-truth
 * here: an order is not *placed* until the money is confirmed, so the
 * two were one milestone wearing two labels. Collapsing them is why
 * `placed` now reads its timestamp from `paidAt`.
 *
 * Pure and `db`-free by construction — only a *type* is imported from
 * `@prisma/client`, which erases at compile time, and `lifecycle.ts`
 * holds to the same rule — so this file carries no runtime dependency on
 * Prisma at all and is safe to import from a client component without
 * pulling a database client into the browser bundle. That is also why the
 * outcome label and tone below are a short local table rather than an
 * import of `ORDER_STATUS_LABEL`/`ORDER_STATUS_TONE`
 * (`src/lib/data/order-history.ts`) — that module's own first line is
 * `import { db } from "@/lib/db"`.
 */

/** One key per stage on the happy path. `cancelled` is not a step. */
export type OrderTimelineStepKey = Exclude<OrderStage, "cancelled">;
export type OrderTimelineStepState = "done" | "current" | "upcoming";

export interface OrderTimelineStep {
  key: OrderTimelineStepKey;
  label: string;
  state: OrderTimelineStepState;
  /** ISO timestamp, or null when this step has not been reached yet. */
  at: string | null;
}

/**
 * Mirrors `OrderStatusTone` (`src/lib/data/order-history.ts`) structurally
 * rather than importing it, for the reason in the module comment above —
 * the same trade-off that module itself makes against `Badge`'s tone
 * type, one hop further out.
 */
export type OrderTimelineOutcomeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "pro"
  | "deep";

export interface OrderTimelineOutcome {
  label: string;
  tone: OrderTimelineOutcomeTone;
}

export interface OrderTimelineResult {
  steps: OrderTimelineStep[];
  outcome: OrderTimelineOutcome | null;
}

export interface OrderTimelineStatusChange {
  toStatus: OrderStatus;
  at: Date | string;
}

export interface OrderTimelineInput {
  status: OrderStatus;
  createdAt: Date | string;
  paidAt: Date | string | null;
  /** Ascending or descending, either is fine — every read here is either
      "the earliest change to X" or "the highest rank across all of them",
      neither of which cares about the array's own order. */
  changes: OrderTimelineStatusChange[];
}

/**
 * How far along the four-step line each status sits.
 *
 * Derived from `stageForStatus` rather than listed again, so the stepper
 * and every other reader of the lifecycle cannot disagree about where
 * `PACKED` belongs. The three retired statuses all map to `placed`,
 * which is what a customer waiting for a parcel would have understood
 * them to mean anyway.
 *
 * A status with no stage — `PENDING_PAYMENT`, `FAILED`, `REFUND_PENDING`,
 * `REFUNDED` — has no rank, and that is deliberate for two different
 * reasons. The first two have not reached the line yet (an order is not
 * placed until its money is confirmed; an abandoned checkout sits in
 * `PENDING_PAYMENT` forever). The last two have left it sideways: they
 * describe money coming back, not a parcel, and `outcome` says so
 * instead of forcing them onto a step they were never "up to".
 */
const STAGE_RANK: Record<OrderTimelineStepKey, number> = {
  placed: 0,
  dispatched: 1,
  out_for_delivery: 2,
  delivered: 3,
};

function rankOf(status: OrderStatus): number | null {
  const stage = stageForStatus(status);
  if (stage === null || stage === "cancelled") return null;
  return STAGE_RANK[stage];
}

/** Same four labels and tones `ORDER_STATUS_LABEL`/`ORDER_STATUS_TONE`
    carry for these statuses — kept local rather than imported; see the
    module comment. */
const OUTCOME: Partial<Record<OrderStatus, OrderTimelineOutcome>> = {
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  FAILED: { label: "Payment failed", tone: "danger" },
  REFUND_PENDING: { label: "Refund pending", tone: "warning" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

const STEPS: {
  key: OrderTimelineStepKey;
  label: string;
  rank: number;
  toStatuses: readonly OrderStatus[];
}[] = [
  /* `placed`'s timestamp comes from `paidAt`, not from a change row — see
     `stepAt`. The three retired statuses are listed anyway so that an
     order which reached `CONFIRMED` through the old flow and never had a
     `paidAt` written still shows a date on this step. */
  { key: "placed", label: "Order placed", rank: 0, toStatuses: ["PAID", "CONFIRMED", "PROCESSING", "PACKED"] },
  { key: "dispatched", label: "Dispatched", rank: 1, toStatuses: ["DISPATCHED"] },
  { key: "out_for_delivery", label: "Out for delivery", rank: 2, toStatuses: ["OUT_FOR_DELIVERY"] },
  { key: "delivered", label: "Delivered", rank: 3, toStatuses: ["DELIVERED"] },
];

function iso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

/** The earliest recorded change into any of `toStatuses`, or null if none
    of them has happened (yet, or ever). ISO strings sort lexically the
    same as they sort chronologically, so no `Date` parsing is needed to
    compare two of them. */
function earliestAt(changes: OrderTimelineStatusChange[], toStatuses: readonly OrderStatus[]): string | null {
  let earliest: string | null = null;
  for (const change of changes) {
    if (!toStatuses.includes(change.toStatus)) continue;
    const at = iso(change.at);
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

function stepAt(step: (typeof STEPS)[number], input: OrderTimelineInput): string | null {
  if (step.key === "placed") {
    /* `paidAt` first: it is written by the settlement itself and is the
       moment the order became real. The change rows are the fallback for
       an order whose `PAID` write predates that column being set, or
       which reached a retired status without one. */
    return input.paidAt != null ? iso(input.paidAt) : earliestAt(input.changes, step.toStatuses);
  }
  return earliestAt(input.changes, step.toStatuses);
}

/**
 * Turns one order's status and history into the four-step customer
 * stepper.
 *
 * Two branches, matching the two shapes an order's life actually takes:
 *
 * **Still on the line.** `status` has a rank, everything up to it is
 * `done`, the first step past it is `current`, and the rest are
 * `upcoming` — a plain walk of `STEPS`. A `PENDING_PAYMENT` order has no
 * rank, so nothing is done and `placed` itself is the current step: the
 * order is in the act of being placed, which is exactly true while the
 * payment is still in flight.
 *
 * **Left the line.** `status` is one of the five statuses `OUTCOME`
 * names. There is no `current` step at all — an order that was cancelled
 * did not pause partway through step 3, it stopped being on this line.
 * What *is* still meaningful is how far it got, recovered from the
 * highest rank among its own `changes`, with `paidAt` alone enough to
 * prove the first step: a captured payment is real even if no
 * `OrderStatusChange` row ever named `PAID` directly.
 */
export function orderTimeline(input: OrderTimelineInput): OrderTimelineResult {
  const outcome = OUTCOME[input.status] ?? null;

  if (outcome) {
    /* -1, not 0: a payment that failed before anything was captured has
       not reached `placed`, and marking it done would tell a customer
       their order exists when it does not. */
    let reached = -1;
    for (const change of input.changes) {
      const rank = rankOf(change.toStatus);
      if (rank != null && rank > reached) reached = rank;
    }
    if (input.paidAt != null && reached < 0) reached = 0;

    return {
      steps: STEPS.map((step) => ({
        key: step.key,
        label: step.label,
        state: step.rank <= reached ? "done" : "upcoming",
        at: stepAt(step, input),
      })),
      outcome,
    };
  }

  const currentRank = rankOf(input.status) ?? -1;
  let currentAssigned = false;

  const steps: OrderTimelineStep[] = STEPS.map((step) => {
    const done = step.rank <= currentRank;
    let state: OrderTimelineStepState;
    if (done) {
      state = "done";
    } else if (!currentAssigned) {
      state = "current";
      currentAssigned = true;
    } else {
      state = "upcoming";
    }
    return { key: step.key, label: step.label, state, at: stepAt(step, input) };
  });

  return { steps, outcome: null };
}
