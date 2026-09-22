import type { OrderStatus } from "@prisma/client";

/**
 * The customer-facing order timeline.
 *
 * `src/lib/data/orders.ts` owns the real lifecycle table
 * (`ORDER_TRANSITIONS`) — twelve statuses, some of them ops vocabulary a
 * customer has no reason to see distinguished (`CONFIRMED` vs
 * `PROCESSING` read the same to someone waiting for a delivery). This
 * module is the one place that folds those twelve into the six milestones
 * a customer actually thinks in, so the order detail page and anything
 * else that ever wants the same stepper compute it identically rather
 * than each hand-rolling a slightly different reading of the same table.
 *
 * Pure and `db`-free by construction — only a *type* is imported from
 * `@prisma/client`, which erases at compile time, so this file carries no
 * runtime dependency on Prisma at all and is safe to import from a client
 * component (a future animated stepper, say) without pulling a database
 * client into the browser bundle. That is also why the outcome label and
 * tone below are a short local table rather than an import of
 * `ORDER_STATUS_LABEL`/`ORDER_STATUS_TONE` (`src/lib/data/order-history.ts`)
 * — that module's own first line is `import { db } from "@/lib/db"`, and
 * importing anything from it, even for its type, would pull that in too.
 */

export type OrderTimelineStepKey = "placed" | "payment" | "confirmed" | "packed" | "out" | "delivered";
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
 * Where each status sits on the "how far has this got" line the six
 * steps below walk. `CONFIRMED`/`PROCESSING` share a rank, and so do
 * `DISPATCHED`/`OUT_FOR_DELIVERY` — see the `confirmed` and `out` steps'
 * `toStatuses` — because the customer-facing milestone is the same one
 * either half of that pair reports.
 *
 * The four terminal statuses (`CANCELLED`, `FAILED`, `REFUND_PENDING`,
 * `REFUNDED`) have no rank at all: they do not sit further along this
 * line, they leave it, which is exactly what `outcome` exists to say
 * instead of forcing them onto a step they were never really "up to".
 */
const RANK: Partial<Record<OrderStatus, number>> = {
  PENDING_PAYMENT: 0,
  PAID: 1,
  CONFIRMED: 2,
  PROCESSING: 2,
  PACKED: 3,
  DISPATCHED: 4,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
};

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
  { key: "placed", label: "Order placed", rank: 0, toStatuses: [] },
  { key: "payment", label: "Payment confirmed", rank: 1, toStatuses: [] },
  { key: "confirmed", label: "Order confirmed", rank: 2, toStatuses: ["CONFIRMED", "PROCESSING"] },
  { key: "packed", label: "Packed", rank: 3, toStatuses: ["PACKED"] },
  { key: "out", label: "Out for delivery", rank: 4, toStatuses: ["DISPATCHED", "OUT_FOR_DELIVERY"] },
  { key: "delivered", label: "Delivered", rank: 5, toStatuses: ["DELIVERED"] },
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
  if (step.key === "placed") return iso(input.createdAt);
  if (step.key === "payment") return input.paidAt != null ? iso(input.paidAt) : null;
  return earliestAt(input.changes, step.toStatuses);
}

/**
 * Turns one order's status and history into the six-step customer stepper.
 *
 * Two branches, matching the two shapes an order's life actually takes:
 *
 * **Still on the line.** `status` has a rank, and everything up to it is
 * `done`, the first step past it is `current`, and the rest are
 * `upcoming` — a plain walk of `STEPS` against `RANK[status]`.
 *
 * **Left the line.** `status` is one of the four terminal statuses, which
 * have no rank of their own — see `OUTCOME`. There is no `current` step
 * here at all: an order that was cancelled did not pause partway through
 * step 3, it stopped being on this line. What *is* still meaningful is
 * how far it got before that happened, recovered from the highest rank
 * among its own `changes` (falling back to at least `payment` if
 * `paidAt` is set, since a captured payment is real even if no
 * `OrderStatusChange` row ever named `PAID` directly — see
 * `recordOfflinePayment`, `src/lib/data/orders.ts`, which does write one,
 * but nothing requires every path to).
 */
export function orderTimeline(input: OrderTimelineInput): OrderTimelineResult {
  const outcome = OUTCOME[input.status] ?? null;

  if (outcome) {
    let reached = 0; // `placed` always happened.
    for (const change of input.changes) {
      const rank = RANK[change.toStatus];
      if (rank != null && rank > reached) reached = rank;
    }
    if (input.paidAt != null && reached < 1) reached = 1;

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

  const currentRank = RANK[input.status] ?? 0;
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
