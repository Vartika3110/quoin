import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { LoadError } from "@/components/storefront/account/LoadError";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Timeline } from "@/components/storefront/orders/Timeline";
import { BuyAgainButton } from "@/components/storefront/orders/BuyAgainButton";
import { AddOrderToProject } from "@/components/storefront/projects/AddOrderToProject";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import { Package } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { formatPrice } from "@/lib/types/catalog";
import { IN_FLIGHT_STATUSES, moneyMoved } from "@/lib/orders/status-groups";
import { orderTimeline } from "@/lib/orders/timeline";
import {
  getOrderForUser,
  getOrderProjectLinks,
  type OrderDetail,
  type OrderProjectLink,
} from "@/lib/data/order-history";

export const dynamic = "force-dynamic";

type Params = { reference: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { reference } = await params;
  return { title: `Order ${reference} — Quoin`, robots: { index: false, follow: false } };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** A `@db.Date` column stored at midnight UTC formatted with an IST
    formatter never crosses a day boundary — see the identical note on
    `OrderCard.formatDateOnly` (`src/components/storefront/orders/OrderCard.tsx`). */
function formatDateOnly(day: string): string {
  return DATE_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

function paymentSummaryLabel(order: OrderDetail): string {
  if (order.status === "REFUNDED") return "Refunded";
  if (order.status === "FAILED") return "Failed";
  if (moneyMoved(order.status)) return "✓ Paid";
  return "Pending";
}

function deliverySummaryLabel(order: OrderDetail): string {
  if (order.status === "DELIVERED") {
    const delivered = order.statusHistory.find((c) => c.toStatus === "DELIVERED");
    return delivered ? `Delivered ${DATE_FORMAT.format(new Date(delivered.at))}` : "Delivered";
  }
  if (!(IN_FLIGHT_STATUSES as readonly string[]).includes(order.status)) return "—";
  return order.expectedDeliveryOn
    ? `Expected ${formatDateOnly(order.expectedDeliveryOn)}`
    : "Date confirmed on call";
}

/**
 * One order, in full, for the customer who placed it.
 *
 * Deliberately never calls `notFound()` for an order that does not exist
 * or belongs to someone else — this segment ships its own `loading.tsx`,
 * which commits a 200 before the page body runs (see the comment on
 * `src/app/account/loading.tsx`), so a `notFound()` here would be a soft
 * 404: status 200, 404 content. `getOrderForUser` already treats "exists
 * but not mine" and "does not exist" identically — see its own comment —
 * so this page just renders the one in-page empty state for both.
 */
export default async function OrderDetailPage({ params }: { params: Promise<Params> }) {
  const session = await getSession();
  const { reference } = await params;

  if (!session) {
    return (
      <AccountShell current="/account/orders" title="Order">
        <SignInPrompt
          what="Signing in shows this order and everything else on your account."
          next={`/account/orders/${reference}`}
        />
      </AccountShell>
    );
  }

  let order: OrderDetail | null;
  let projects: OrderProjectLink[];
  try {
    [order, projects] = await Promise.all([
      getOrderForUser(session.userId, reference),
      getOrderProjectLinks(session.userId, reference),
    ]);
  } catch (error) {
    console.error("[account/orders/detail] failed to load order", error);
    return (
      <AccountShell current="/account/orders" title="Order">
        <LoadError title="We couldn't load this order." />
      </AccountShell>
    );
  }

  if (!order) {
    return (
      <AccountShell current="/account/orders" title="Order">
        <EmptyState
          icon={<Package className="size-6" />}
          title="We couldn't find that order"
          action={{ href: "/account/orders", label: "Back to orders" }}
        >
          It may belong to a different account, or the link may be out of date.
        </EmptyState>
      </AccountShell>
    );
  }

  const timeline = orderTimeline({
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    changes: order.statusHistory,
  });

  return (
    <AccountShell
      current="/account/orders"
      title={`Order ${order.reference}`}
      subtitle={`Placed ${DATE_TIME_FORMAT.format(order.createdAt)}`}
    >
      <TrackEvent event="order_viewed" props={{ reference: order.reference, status: order.status }} />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-caption text-muted">Payment</p>
            <p className="mt-1 text-body-sm font-semibold text-ink">{paymentSummaryLabel(order)}</p>
          </Card>
          <Card>
            <p className="text-caption text-muted">Total</p>
            <p className="nums mt-1 text-body-sm font-semibold text-ink">{formatPrice(order.totalPaise)}</p>
          </Card>
          <Card>
            <p className="text-caption text-muted">Delivery</p>
            <p className="mt-1 text-body-sm font-semibold text-ink">{deliverySummaryLabel(order)}</p>
          </Card>
        </div>

        <div id="timeline">
          <Card>
            <CardHeader title="Order status" />
            <Timeline timeline={timeline} />
          </Card>
        </div>

        <Card padding="none" className="overflow-hidden">
          <CardHeader
            title="Items"
            subtitle={`${order.lines.length} line${order.lines.length === 1 ? "" : "s"}`}
            className="px-4 pt-4 sm:px-5 sm:pt-5"
          />

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-line-soft bg-sunk text-micro uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium sm:pl-5">Product</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 text-right font-medium">Unit price</th>
                  <th className="px-4 py-3 text-right font-medium sm:pr-5">Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={`${line.variantId}-${line.sku}`} className="border-b border-line-hair last:border-0">
                    <td className="px-4 py-3 sm:pl-5">
                      <Link href={`/p/${line.productSlug}`} className="flex items-center gap-3">
                        <span className="block size-11 shrink-0 overflow-hidden rounded-lg border border-line-soft bg-photo">
                          <ProductImage photo={line.photo} swatchKey={line.swatchKey} label={line.title} className="size-full" />
                        </span>
                        <span className="min-w-0 text-ink hover:text-accent">{line.title}</span>
                      </Link>
                    </td>
                    <td className="nums px-4 py-3">{line.qty}</td>
                    <td className="px-4 py-3 text-muted">{line.variantLabel}</td>
                    <td className="nums px-4 py-3 text-right">{formatPrice(line.unitPricePaise)}</td>
                    <td className="nums px-4 py-3 text-right font-medium text-ink sm:pr-5">
                      {formatPrice(line.linePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line-hair sm:hidden">
            {order.lines.map((line) => (
              <li key={`${line.variantId}-${line.sku}-m`} className="p-4">
                <Link href={`/p/${line.productSlug}`} className="flex items-start gap-3">
                  <span className="block size-14 shrink-0 overflow-hidden rounded-lg border border-line-soft bg-photo">
                    <ProductImage photo={line.photo} swatchKey={line.swatchKey} label={line.title} className="size-full" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm text-ink">{line.title}</span>
                    <span className="block text-caption text-muted">
                      {line.variantLabel} · Qty {line.qty}
                    </span>
                    <span className="nums mt-1 block text-body-sm font-semibold text-ink">
                      {formatPrice(line.linePaise)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Delivery address" />
          <p className="text-body-sm text-ink">
            {order.shipping.name ? `${order.shipping.name} · ` : ""}
            {order.shipping.phone}
          </p>
          <p className="mt-0.5 text-body-sm text-muted">
            {order.shipping.line1}
            {order.shipping.line2 ? `, ${order.shipping.line2}` : ""}
            {order.shipping.landmark ? ` (${order.shipping.landmark})` : ""}
          </p>
          <p className="text-body-sm text-muted">
            {order.shipping.city}, {order.shipping.state} {order.shipping.pincode}
          </p>
        </Card>

        <Card>
          <CardHeader title="Payment summary" />
          <div className="space-y-1.5 text-body-sm">
            <MoneyRow label="Subtotal" value={formatPrice(order.subtotalPaise)} />
            {order.discountPaise > 0 && (
              <MoneyRow label="Discount" value={`− ${formatPrice(order.discountPaise)}`} />
            )}
            <MoneyRow label="GST (included in prices)" value={formatPrice(order.taxPaise)} muted />
            {order.deliveryFeePaise > 0 && (
              <MoneyRow label="Delivery" value={formatPrice(order.deliveryFeePaise)} />
            )}
            <MoneyRow
              label={moneyMoved(order.status) ? "Total paid" : "Total payable"}
              value={formatPrice(order.totalPaise)}
              strong
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Invoice" />
          {moneyMoved(order.status) ? (
            <Button href={`/account/orders/${order.reference}/receipt`} variant="outline" size="sm">
              Download Invoice
            </Button>
          ) : (
            <p className="text-body-sm text-muted">Available once payment is confirmed.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Filed under" />
          {projects.length > 0 && (
            <ul className="mb-3 space-y-1">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link href={`/projects/${project.id}`} className="text-body-sm font-medium text-accent">
                    {project.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <AddOrderToProject reference={order.reference} compact />
        </Card>

        <Card>
          <CardHeader title="Need help?" />
          <div className="flex flex-wrap gap-2">
            <Button
              href={`/account/support?order=${order.reference}&category=orders&type=issue`}
              variant="outline"
              size="sm"
            >
              Report an Issue
            </Button>
            <Button href={`/account/support?order=${order.reference}&category=orders`} variant="outline" size="sm">
              Contact Support
            </Button>
            <BuyAgainButton reference={order.reference} />
          </div>
        </Card>
      </div>
    </AccountShell>
  );
}

function MoneyRow({
  label,
  value,
  muted = false,
  strong = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={
        "nums flex items-center justify-between " +
        (strong ? "border-t border-line-hair pt-2 text-body font-semibold text-ink" : "")
      }
    >
      <span className={muted ? "text-muted" : "text-ink"}>{label}</span>
      <span className={muted ? "text-muted" : "text-ink"}>{value}</span>
    </div>
  );
}
