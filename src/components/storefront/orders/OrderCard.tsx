import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProductImage } from "@/components/storefront/ProductImage";
import { BuyAgainButton } from "@/components/storefront/orders/BuyAgainButton";
import { formatPrice } from "@/lib/types/catalog";
import { IN_FLIGHT_STATUSES, moneyMoved } from "@/lib/orders/status-groups";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  type OrderStatusTone,
  type OrderSummary,
} from "@/lib/data/order-history";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** A `@db.Date` column stored at midnight UTC formatted with an IST
    formatter never crosses a day boundary — midnight UTC is 05:30 the
    same calendar day in IST — so this is safe against the date silently
    shifting, matching the reasoning behind `fromCalendarDate`
    (`src/lib/data/projects.ts`). */
function formatDateOnly(day: string): string {
  return DATE_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/**
 * The payment badge shown on an order card.
 *
 * `order.paymentStatus` is null for a callback order nobody has settled
 * yet, or an online attempt that crashed before a gateway order existed
 * — see `Payment`'s model comment. Falling back to `moneyMoved(status)`
 * rather than showing nothing keeps the badge honest in exactly the two
 * cases that matter: a still-pending callback order reads "Payment
 * pending", and an order staff moved straight to PAID some other way
 * (there is only one such way today, `recordOfflinePayment`, and that
 * *does* leave a `Payment` row — this fallback is what a future path that
 * did not would fall onto) still reads "Paid" rather than blank.
 */
function paymentBadge(order: OrderSummary): { label: string; tone: OrderStatusTone } {
  if (order.paymentStatus) {
    const tone: OrderStatusTone =
      order.paymentStatus === "CAPTURED"
        ? "success"
        : order.paymentStatus === "FAILED"
          ? "danger"
          : order.paymentStatus === "REFUNDED"
            ? "neutral"
            : "warning";
    return { label: PAYMENT_STATUS_LABEL[order.paymentStatus], tone };
  }
  return moneyMoved(order.status)
    ? { label: "Paid", tone: "success" }
    : { label: "Payment pending", tone: "warning" };
}

/** The delivery line under the badges — never a courier, a slot or a
    number nothing behind this app actually tracks (see
    `docs/design-system.md`, "What the system deliberately does not
    draw"). Blank for anything that is neither still moving nor
    delivered: a cancelled or refunded order has no delivery to report. */
function deliveryLine(order: OrderSummary): string | null {
  if (order.status === "DELIVERED") {
    return order.deliveredAt ? `Delivered ${DATE_FORMAT.format(order.deliveredAt)}` : "Delivered";
  }
  if (!(IN_FLIGHT_STATUSES as readonly string[]).includes(order.status)) return null;
  return order.expectedDeliveryOn
    ? `Expected ${formatDateOnly(order.expectedDeliveryOn)}`
    : "Date confirmed on call";
}

export function OrderCard({ order }: { order: OrderSummary }) {
  const payment = paymentBadge(order);
  const delivery = deliveryLine(order);
  const extraCount = order.itemCount - order.thumbnails.length;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="nums font-mono text-caption text-muted">{order.reference}</p>
          <p className="text-caption text-faint">
            {DATE_FORMAT.format(order.createdAt)} · {order.itemCount} item
            {order.itemCount === 1 ? "" : "s"}
          </p>
        </div>
        <p className="nums text-body font-semibold text-ink">{formatPrice(order.totalPaise)}</p>
      </div>

      {order.thumbnails.length > 0 && (
        <div className="flex items-center gap-2">
          {order.thumbnails.map((thumb) => (
            <span
              key={thumb.productSlug}
              className="block size-11 shrink-0 overflow-hidden rounded-lg border border-line-soft bg-photo"
            >
              <ProductImage photo={thumb.photo} swatchKey={thumb.swatchKey} label={thumb.title} className="size-full" />
            </span>
          ))}
          {extraCount > 0 && (
            <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-line-soft bg-sunk text-caption font-medium text-muted">
              +{extraCount}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
        <Badge tone={payment.tone}>{payment.label}</Badge>
      </div>

      {delivery && <p className="text-caption text-muted">{delivery}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button href={`/account/orders/${order.reference}#timeline`} size="sm" variant="outline">
          Track Order
        </Button>
        <Button href={`/account/orders/${order.reference}`} size="sm" variant="outline">
          View Details
        </Button>
        {moneyMoved(order.status) && (
          <Button href={`/account/orders/${order.reference}/receipt`} size="sm" variant="outline">
            Download Invoice
          </Button>
        )}
        <BuyAgainButton reference={order.reference} />
        <Button href={`/account/support?order=${order.reference}&category=orders`} size="sm" variant="ghost">
          Get Help
        </Button>
      </div>
    </Card>
  );
}
