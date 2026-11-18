import type { OrderStatus } from "@prisma/client";
import { Check, Close } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { ORDER_STAGE_LABEL, ORDER_STAGE_SEQUENCE, stageForStatus } from "@/lib/orders/lifecycle";

/**
 * The visual order timeline on the admin order page.
 *
 * Every dot, every timestamp and every "who" on this component comes from
 * a real `OrderStatusChange` row. Nothing is hardcoded and nothing is
 * inferred from the current status alone: if the history says an order
 * went placed → dispatched → delivered with no out-for-delivery row, that
 * is what this draws, because that is what happened. A timeline that
 * invented the missing step would be worse than useless on the one page
 * somebody opens *because* they are trying to work out what happened.
 *
 * Related to the customer's own four-step stepper
 * (`src/components/storefront/orders/Timeline.tsx`) and deliberately not
 * the same thing. That one answers "where is my parcel" and smooths the
 * history into four milestones. This one answers "what has been done to
 * this order, by whom, and when", which is a different question with
 * different right answers — most obviously that a cancellation belongs
 * *in* this timeline, at the point it happened, rather than as a badge
 * beside it.
 *
 * A server component: no state, no interactivity, nothing a browser needs
 * to re-render.
 */

export interface OrderTimelineEntry {
  id: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  actorName: string | null;
  actorPhone: string | null;
  note: string | null;
  createdAt: Date;
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Who moved it, in the admin's own vocabulary.
 *
 * A null actor is **not** "unknown" and must not read as though it were.
 * It means no account was involved, and there are exactly two ways that
 * happens: a vendor dispatching their own leg through their WhatsApp link
 * (there is no vendor account system — see
 * `OrderFulfilment.actionToken`), or the payment webhook. The note
 * written alongside the transition says which, so this falls back to the
 * honest "Vendor / automated" rather than naming a person who was not
 * there.
 */
function actorLabel(entry: OrderTimelineEntry): string {
  return entry.actorName ?? entry.actorPhone ?? "Vendor / automated";
}

export function OrderTimeline({
  status,
  createdAt,
  paidAt,
  entries,
}: {
  status: OrderStatus;
  createdAt: Date;
  paidAt: Date | null;
  /** Oldest first. The caller sorts; this renders. */
  entries: OrderTimelineEntry[];
}) {
  /* The order being created is the one event with no `OrderStatusChange`
     row behind it — nothing transitions *into* PENDING_PAYMENT, it is
     where an order starts — so it is prepended as a synthetic first node.
     It is still a real timestamp off a real column, not a hardcoded step:
     `Order.createdAt`. */
  const nodes: {
    key: string;
    label: string;
    at: Date;
    detail: string | null;
    note: string | null;
    tone: "done" | "cancelled";
  }[] = [
    {
      key: "created",
      label: "Checkout started",
      at: createdAt,
      detail: paidAt ? `Payment confirmed ${DATE_TIME_FORMAT.format(paidAt)}` : "Awaiting payment",
      note: null,
      tone: "done",
    },
    ...entries.map((entry) => {
      const stage = stageForStatus(entry.toStatus);
      return {
        key: entry.id,
        /* The stage name where the status has one — so `PAID` reads
           "Order placed", which is what it means to everybody outside
           this codebase. The raw status is the fallback for the ones
           that are not on the lifecycle at all (a refund, a failed
           payment attempt), which still belong on an audit trail. */
        label: stage ? ORDER_STAGE_LABEL[stage] : entry.toStatus.replace(/_/g, " ").toLowerCase(),
        at: entry.createdAt,
        detail: `${entry.toStatus === "CANCELLED" ? "Cancelled" : "Updated"} by: ${actorLabel(entry)}`,
        note: entry.note,
        tone: entry.toStatus === "CANCELLED" ? ("cancelled" as const) : ("done" as const),
      };
    }),
  ];

  const currentStage = stageForStatus(status);
  /* The stages still ahead of this order, drawn hollow after the real
     history — so the page shows both what has happened and what is left,
     without pretending the latter has timestamps. Nothing is shown ahead
     of a cancelled order: there is nowhere further for it to go. */
  const upcoming =
    currentStage === null || currentStage === "cancelled"
      ? []
      : ORDER_STAGE_SEQUENCE.slice(ORDER_STAGE_SEQUENCE.indexOf(currentStage) + 1);

  return (
    <ol>
      {nodes.map((node, i) => {
        const last = i === nodes.length - 1 && upcoming.length === 0;
        return (
          <li key={node.key} className="relative flex gap-3">
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[11px] top-6 h-[calc(100%_-_8px)] w-px",
                  node.tone === "cancelled" ? "bg-line-soft" : "bg-accent",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border",
                node.tone === "cancelled"
                  ? "border-danger/25 bg-danger-wash text-danger"
                  : "border-accent bg-accent text-on-accent",
              )}
            >
              {node.tone === "cancelled" ? (
                <Close className="size-3.5" />
              ) : (
                <Check className="size-3.5" />
              )}
            </span>
            <div className={cn("min-w-0 flex-1 pb-6", last && "pb-0")}>
              <p className="text-body-sm font-medium uppercase tracking-wide text-ink">
                {node.label}
              </p>
              <p className="nums mt-0.5 text-caption text-muted">
                {DATE_TIME_FORMAT.format(node.at)}
              </p>
              {node.detail && <p className="text-caption text-muted">{node.detail}</p>}
              {node.note && (
                <p className="mt-1 text-caption text-muted">
                  {node.tone === "cancelled" ? "Reason: " : ""}
                  {node.note}
                </p>
              )}
            </div>
          </li>
        );
      })}

      {upcoming.map((stage, i) => (
        <li key={stage} className="relative flex gap-3">
          {i < upcoming.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[11px] top-6 h-[calc(100%_-_8px)] w-px bg-line-soft"
            />
          )}
          <span
            aria-hidden
            className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border border-line-soft bg-surface text-faint"
          >
            <span className="block size-1.5 rounded-full bg-current" />
          </span>
          <div className={cn("min-w-0 flex-1 pb-6", i === upcoming.length - 1 && "pb-0")}>
            <p className="text-body-sm font-medium uppercase tracking-wide text-faint">
              {ORDER_STAGE_LABEL[stage]}
            </p>
            <p className="text-caption text-faint">Not yet</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
