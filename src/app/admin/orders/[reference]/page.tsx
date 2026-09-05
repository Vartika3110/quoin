import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OrderStatusForm } from "@/components/admin/OrderStatusForm";
import { requireStaffPage } from "@/lib/auth/staff";
import { formatPrice } from "@/lib/types/catalog";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
} from "@/lib/data/order-history";
import {
  FULFILMENT_LABEL,
  REFUND_STATUS_LABEL,
  getAdminOrder,
  legalNextStatuses,
} from "@/lib/data/admin-orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order — Quoin",
  robots: { index: false, follow: false },
};

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type Ctx = { params: Promise<{ reference: string }> };

/**
 * One order, in full — everything a person on the phone with this
 * customer needs, in the order they are likely to need it: what is
 * happening with it, what it cost, where it is going, who it is going to,
 * whether it was actually paid for, and what has already been done to it.
 */
export default async function AdminOrderPage({ params }: Ctx) {
  await requireStaffPage();

  const { reference } = await params;
  const order = await getAdminOrder(reference);
  if (!order) notFound();

  const nextStatusOptions = legalNextStatuses(order.status).map((value) => ({
    value,
    label: ORDER_STATUS_LABEL[value],
  }));

  return (
    <AdminShell
      current="/admin/orders"
      title={order.reference}
      subtitle={`Placed ${DATE_TIME_FORMAT.format(order.createdAt)} by ${order.customer.name ?? "an unnamed account"}`}
      actions={
        <Button href="/admin/orders" variant="outline" size="sm">
          Back to orders
        </Button>
      }
    >
      <Badge tone={ORDER_STATUS_TONE[order.status]} className="mb-6">
        {ORDER_STATUS_LABEL[order.status]}
      </Badge>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Items" subtitle={`${order.lines.length} line${order.lines.length === 1 ? "" : "s"}`} />
            <ul className="space-y-3">
              {order.lines.map((line) => (
                <li
                  key={`${line.variantId}-${line.sku}`}
                  className="flex items-start justify-between gap-3 border-b border-line-hair pb-3 text-body-sm last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-ink">{line.title}</p>
                    <p className="nums mt-0.5 text-caption text-muted">
                      {line.variantLabel} · SKU {line.sku} · Qty {line.qty} ·{" "}
                      {FULFILMENT_LABEL[line.fulfilment]}
                    </p>
                    <p className="mt-0.5 text-caption text-faint">
                      GST {line.gstRatePct}% (included) — {formatPrice(line.taxPaise)}
                    </p>
                  </div>
                  <div className="nums shrink-0 text-right">
                    <p className="text-ink">{formatPrice(line.linePaise)}</p>
                    <p className="text-caption text-muted">{formatPrice(line.unitPricePaise)} each</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            {order.payments.length === 0 ? (
              <p className="text-body-sm text-muted">
                Nothing sent to the gateway yet — this is a callback order, or checkout was
                abandoned before payment started.
              </p>
            ) : (
              <ul className="space-y-4">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="border-b border-line-hair pb-4 text-body-sm last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge
                        tone={
                          payment.status === "CAPTURED"
                            ? "success"
                            : payment.status === "FAILED"
                              ? "danger"
                              : "neutral"
                        }
                        size="sm"
                      >
                        {PAYMENT_STATUS_LABEL[payment.status]}
                      </Badge>
                      <span className="nums text-ink">{formatPrice(payment.amountPaise)}</span>
                    </div>
                    <dl className="nums mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption text-muted">
                      <dt>Gateway order</dt>
                      <dd className="truncate text-ink">{payment.providerOrderId}</dd>
                      {payment.providerPaymentId && (
                        <>
                          <dt>Gateway payment</dt>
                          <dd className="truncate text-ink">{payment.providerPaymentId}</dd>
                        </>
                      )}
                      {payment.method && (
                        <>
                          <dt>Method</dt>
                          <dd className="text-ink">{payment.method}</dd>
                        </>
                      )}
                      <dt>Attempted</dt>
                      <dd className="text-ink">{DATE_TIME_FORMAT.format(payment.createdAt)}</dd>
                    </dl>
                    {payment.failureReason && (
                      <p className="mt-2 rounded-lg bg-danger-wash px-3 py-2 text-caption text-danger">
                        {payment.failureReason}
                      </p>
                    )}

                    {payment.refunds.length > 0 && (
                      <ul className="mt-3 space-y-2 border-t border-line-hair pt-3">
                        {payment.refunds.map((refund) => (
                          <li key={refund.id} className="flex items-center justify-between gap-3 text-caption">
                            <span className="text-muted">
                              {REFUND_STATUS_LABEL[refund.status]}
                              {refund.reason ? ` — ${refund.reason}` : ""}
                            </span>
                            <span className="nums text-ink">{formatPrice(refund.amountPaise)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Status history" subtitle="Newest first" />
            {order.statusChanges.length === 0 ? (
              <p className="text-body-sm text-muted">
                No staff action has been recorded against this order yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {order.statusChanges.map((change) => (
                  <li key={change.id} className="text-body-sm">
                    <p className="text-ink">
                      {ORDER_STATUS_LABEL[change.fromStatus]} → {ORDER_STATUS_LABEL[change.toStatus]}
                    </p>
                    <p className="text-caption text-muted">
                      {DATE_TIME_FORMAT.format(change.createdAt)} ·{" "}
                      {change.actorName ?? change.actorPhone ?? "Automated"}
                    </p>
                    {change.note && <p className="mt-1 text-caption text-muted">“{change.note}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card tone="sunk">
            <CardHeader title="Change status" />
            <OrderStatusForm reference={order.reference} options={nextStatusOptions} />
          </Card>

          <Card>
            <CardHeader title="Money" />
            <dl className="space-y-1.5 text-body-sm">
              <MoneyRow label="Subtotal" value={formatPrice(order.subtotalPaise)} />
              <MoneyRow
                label="GST (included in the price)"
                value={formatPrice(order.taxPaise)}
                muted
              />
              {order.discountPaise > 0 && (
                <MoneyRow label="Discount" value={`− ${formatPrice(order.discountPaise)}`} />
              )}
              {order.deliveryFeePaise > 0 && (
                <MoneyRow label="Delivery" value={formatPrice(order.deliveryFeePaise)} />
              )}
              <MoneyRow
                label={order.status === "PAID" ? "Total paid" : "Total payable"}
                value={formatPrice(order.totalPaise)}
                strong
              />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <p className="text-body-sm text-ink">{order.customer.name ?? "Unnamed account"}</p>
            <p className="nums text-body-sm text-muted">{order.customer.phone}</p>
          </Card>

          <Card>
            <CardHeader title="Delivery address" />
            <p className="text-body-sm text-ink">{order.shipping.name}</p>
            <p className="nums text-body-sm text-muted">{order.shipping.phone}</p>
            <p className="mt-2 text-body-sm text-muted">
              {order.shipping.line1}
              {order.shipping.line2 ? `, ${order.shipping.line2}` : ""}
              {order.shipping.landmark ? ` (${order.shipping.landmark})` : ""}
            </p>
            <p className="text-body-sm text-muted">
              {order.shipping.city}, {order.shipping.state} {order.shipping.pincode}
            </p>
          </Card>
        </div>
      </div>
    </AdminShell>
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
