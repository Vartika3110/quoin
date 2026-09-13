import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/types/catalog";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_STATUS_LABEL } from "@/lib/data/order-history";
import type { AdminBoardCard as AdminBoardCardData } from "@/lib/data/admin-board";
import { formatRelativeIst } from "@/lib/data/admin-board";
import { BoardAdvanceButton } from "@/components/admin/BoardAdvanceButton";

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * One order, as a tap target.
 *
 * A plain server component — the only interactive piece is the advance
 * button, which is its own client component
 * (`src/components/admin/BoardAdvanceButton.tsx`); everything else here
 * is static markup that re-renders for free every time
 * `BoardAutoRefresh` pulls a fresh board.
 */
export function BoardCard({
  card,
  now,
  muted = false,
}: {
  card: AdminBoardCardData;
  now: Date;
  muted?: boolean;
}) {
  return (
    <Card tone={muted ? "sunk" : "plain"} padding="sm" className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/admin/orders/${card.reference}`}
          className="nums font-medium text-ink hover:text-accent"
        >
          {card.reference}
        </Link>
        <Badge tone={ORDER_STATUS_TONE[card.status]} size="sm">
          {ORDER_STATUS_LABEL[card.status]}
        </Badge>
      </div>

      <p
        className="text-caption text-muted"
        title={DATE_TIME_FORMAT.format(card.createdAt)}
      >
        {formatRelativeIst(card.createdAt, now)}
      </p>

      <p className="truncate text-body-sm text-ink">{card.customerLabel}</p>
      <p className="nums text-caption text-muted">
        {card.shipCity}, {card.shipPincode}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-caption text-muted">
          {card.itemCount} item{card.itemCount === 1 ? "" : "s"}
        </span>
        <span className="nums font-medium text-ink">{formatPrice(card.totalPaise)}</span>
      </div>

      {(card.isCallback || card.paymentStatus) && (
        <Badge tone={card.isCallback ? "warning" : "neutral"} size="sm">
          {card.isCallback ? "Callback" : PAYMENT_STATUS_LABEL[card.paymentStatus!]}
        </Badge>
      )}

      {card.nextStatus ? (
        <BoardAdvanceButton
          reference={card.reference}
          toStatus={card.nextStatus}
          label={`Mark ${ORDER_STATUS_LABEL[card.nextStatus]}`}
        />
      ) : card.isCallback ? (
        /* No one-tap move exists for a callback order — see the note on
           `getOrderBoard` — and money is deliberately not one-tap anyway:
           this sends staff to the full "Mark payment received" form
           rather than trying to collect an amount and a method on the
           board itself. */
        <Button href={`/admin/orders/${card.reference}#payment`} size="sm" variant="outline" block>
          Mark paid
        </Button>
      ) : (
        <Link
          href={`/admin/orders/${card.reference}`}
          className="block text-center text-caption text-accent"
        >
          View order
        </Link>
      )}
    </Card>
  );
}
