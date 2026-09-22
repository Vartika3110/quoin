import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Package } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";
import { plural } from "@/lib/account/greeting";
import { IN_FLIGHT_STATUSES } from "@/lib/orders/status-groups";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/data/order-history";
import { DashboardCardHead } from "@/components/storefront/account/dashboard/DashboardCardHead";
import type { AccountOverviewOrder } from "@/lib/data/account-overview";

/** `Order.expectedDeliveryOn` is a `@db.Date` column, already reduced to
    `YYYY-MM-DD` by `listOrdersForUser` — `timeZone: "UTC"` reads that
    string back as the calendar day it names, matching `OrderCard`'s own
    `formatDateOnly` (`src/components/storefront/orders/OrderCard.tsx`). */
const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

function formatDateOnly(day: string): string {
  return DATE_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/** "Expected {date}" only while an order is genuinely still moving —
    everything else, paid-but-not-yet-confirmed, delivered, cancelled or
    refunded, shows what actually happened rather than a delivery promise
    that no longer applies. Mirrors `deliveryLine` in `OrderCard.tsx`,
    widened to cover every status that function leaves blank, since this
    card has no second line to fall back to silence on. */
function deliveryLine(order: Pick<AccountOverviewOrder, "status" | "expectedDeliveryOn">): string {
  if ((IN_FLIGHT_STATUSES as readonly string[]).includes(order.status)) {
    return order.expectedDeliveryOn
      ? `Expected ${formatDateOnly(order.expectedDeliveryOn)}`
      : "Date confirmed on call";
  }
  return ORDER_STATUS_LABEL[order.status];
}

export function OrdersCard({
  activeOrderCount,
  latestOrder,
}: {
  activeOrderCount: number;
  latestOrder: AccountOverviewOrder | null;
}) {
  return (
    <Card padding="lg" className="anim-rise flex h-full flex-col">
      <DashboardCardHead icon={<Package className="size-4.5" />} title="Orders" />

      {!latestOrder ? (
        <>
          <p className="mt-3 text-body-sm font-semibold text-ink">No orders yet.</p>
          <p className="mt-1 flex-1 text-body-sm leading-relaxed text-muted">
            Once you place an order, you&rsquo;ll be able to track everything here.
          </p>
          <Button href="/products" variant="outline" size="sm" className="mt-4 self-start">
            Start Shopping
          </Button>
        </>
      ) : (
        <>
          <p className="nums mt-3 text-title-sm font-semibold text-ink">
            {activeOrderCount} {plural(activeOrderCount, "Active Order", "Active Orders")}
          </p>

          <div className="mt-4 flex-1 space-y-2 border-t border-line-hair pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="nums font-mono text-caption text-muted">Order {latestOrder.reference}</p>
              <p className="nums text-body-sm font-semibold text-ink">
                {formatPrice(latestOrder.totalPaise)}
              </p>
            </div>
            <Badge tone={ORDER_STATUS_TONE[latestOrder.status]} size="sm">
              {ORDER_STATUS_LABEL[latestOrder.status]}
            </Badge>
            <p className="text-caption text-muted">{deliveryLine(latestOrder)}</p>
            <p className="nums text-caption text-faint">
              {latestOrder.itemCount} {plural(latestOrder.itemCount, "item", "items")}
            </p>
          </div>

          <Button
            href={`/account/orders/${latestOrder.reference}#timeline`}
            variant="outline"
            size="sm"
            className="mt-4 self-start"
          >
            Track Order
          </Button>
        </>
      )}
    </Card>
  );
}
