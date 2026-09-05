import { Badge } from "@/components/ui/Badge";
import { ChevronDown, Package } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  type OrderDetail,
} from "@/lib/data/order-history";

/**
 * A customer's own orders, newest first.
 *
 * Built on `<details>`/`<summary>`, matching `Accordion`
 * (`src/components/ui/Accordion.tsx`) rather than reusing it directly —
 * that component's `title`/`subtitle` are plain strings, and a row here
 * needs a status badge and a price inside its always-visible summary. The
 * markup below is the same primitive with a richer header, not a new
 * interaction: no JavaScript is involved, and the whole order is already
 * on the page — expanding a row costs nothing further.
 */
export function OrderList({ orders }: { orders: OrderDetail[] }) {
  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.reference}>
          <OrderRow order={order} />
        </li>
      ))}
    </ul>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function OrderRow({ order }: { order: OrderDetail }) {
  const preview = order.lines.slice(0, 2).map((line) => line.title).join(", ");
  const moreCount = order.lines.length - Math.min(2, order.lines.length);

  return (
    <details className="group overflow-hidden rounded-card border border-line-soft bg-surface">
      <summary
        className="flex cursor-pointer list-none items-start gap-4 px-4 py-4 transition-colors hover:bg-hover [&::-webkit-details-marker]:hidden"
      >
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
          <Package className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-body-sm font-semibold text-ink">
              {preview}
              {moreCount > 0 && ` +${moreCount} more`}
            </span>
            <Badge tone={ORDER_STATUS_TONE[order.status]} size="sm">
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
          </span>
          <span className="nums mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
            <span className="font-mono">{order.reference}</span>
            <span>{DATE_FORMAT.format(order.createdAt)}</span>
            <span>
              {order.lines.length} item{order.lines.length === 1 ? "" : "s"}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="nums text-body font-semibold text-ink">
            {formatPrice(order.totalPaise)}
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 text-muted transition-transform duration-200 group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="space-y-4 border-t border-line-hair px-4 py-4">
        <ul className="space-y-2">
          {order.lines.map((line) => (
            <li
              key={`${line.variantId}-${line.sku}`}
              className="flex items-start justify-between gap-3 text-body-sm"
            >
              <span className="min-w-0">
                <span className="block text-ink">{line.title}</span>
                <span className="text-caption text-muted">
                  {line.variantLabel} · Qty {line.qty}
                </span>
              </span>
              <span className="nums shrink-0 text-ink">{formatPrice(line.linePaise)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1 border-t border-line-hair pt-3 text-body-sm">
          <MoneyRow label="Subtotal" value={formatPrice(order.subtotalPaise)} />
          {/* Prices are GST-inclusive — `taxPaise` is a component already
              inside `subtotalPaise`, shown here so an invoice can say what
              the rate was, never added as a further charge. */}
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
          {/* "Paid" only when it has been. Most rows here are
              PENDING_PAYMENT — a callback order is waiting on an expert to
              phone, and telling that customer they have paid is both
              wrong and the kind of wrong that generates a support call. */}
          <MoneyRow
            label={order.status === "PAID" ? "Total paid" : "Total payable"}
            value={formatPrice(order.totalPaise)}
            strong
          />
        </div>

        <div className="border-t border-line-hair pt-3 text-body-sm">
          <p className="font-medium text-ink">Delivery address</p>
          <p className="mt-0.5 text-muted">
            {/* The separator belongs to the name, not to the line: orders
                placed before the account had a name on it carry an empty
                `shipName`, and an unconditional "·" renders a bullet
                floating in front of a phone number. */}
            {order.shipping.name ? `${order.shipping.name} · ` : ""}
            {order.shipping.phone}
          </p>
          <p className="text-muted">
            {order.shipping.line1}
            {order.shipping.line2 ? `, ${order.shipping.line2}` : ""}
            {order.shipping.landmark ? ` (${order.shipping.landmark})` : ""}
          </p>
          <p className="text-muted">
            {order.shipping.city}, {order.shipping.state} {order.shipping.pincode}
          </p>
        </div>

        {order.payment && (
          <div className="border-t border-line-hair pt-3 text-body-sm text-muted">
            {order.payment.method ? `Paid by ${order.payment.method} · ` : ""}
            {PAYMENT_STATUS_LABEL[order.payment.status]}
          </div>
        )}
      </div>
    </details>
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
        (strong ? "pt-1 text-body font-semibold text-ink" : "text-body-sm")
      }
    >
      <span className={muted ? "text-muted" : "text-ink"}>{label}</span>
      <span className={muted ? "text-muted" : "text-ink"}>{value}</span>
    </div>
  );
}
