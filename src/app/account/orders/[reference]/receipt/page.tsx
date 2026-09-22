import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { PrintReceiptButton } from "@/components/storefront/orders/PrintReceiptButton";
import { getSession } from "@/lib/auth/session";
import { formatPrice } from "@/lib/types/catalog";
import { moneyMoved } from "@/lib/orders/status-groups";
import { getOrderForUser, PAYMENT_STATUS_LABEL, type OrderDetail } from "@/lib/data/order-history";

export const dynamic = "force-dynamic";

type Params = { reference: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { reference } = await params;
  return { title: `Order summary ${reference} — Quoin`, robots: { index: false, follow: false } };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Standalone print-friendly page — no `AppShell`, and deliberately so: a
 * printed page carrying a sticky header, a category menu and a tab bar
 * either prints all of it or has to fight the browser's own print
 * stylesheet to hide it. A plain wordmark is the only chrome a receipt
 * needs.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg px-5 py-8 text-ink sm:py-12">
      <div className="mx-auto max-w-2xl">
        <p className="font-display text-title-sm font-semibold text-ink">Quoin</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * "Order summary" — explicitly not a GST tax invoice. Nothing here
 * changes that: it is a plain-language record of what was bought and
 * what was paid, for a customer's own records or to print for a site
 * office. A real tax invoice needs a seller GSTIN, an invoice number
 * sequence and other statutory fields this app does not generate, and
 * printing something that merely *looks* like one would be worse than
 * this honest label.
 */
export default async function ReceiptPage({ params }: { params: Promise<Params> }) {
  const session = await getSession();
  const { reference } = await params;

  if (!session) {
    return (
      <Shell>
        <p className="text-body-sm text-muted">Sign in to view this order summary.</p>
        <Button href={`/signin?next=${encodeURIComponent(`/account/orders/${reference}/receipt`)}`} className="mt-4 print:hidden">
          Sign in
        </Button>
      </Shell>
    );
  }

  let order: OrderDetail | null;
  try {
    order = await getOrderForUser(session.userId, reference);
  } catch (error) {
    console.error("[account/orders/receipt] failed to load order", error);
    return (
      <Shell>
        <p className="text-body-sm text-muted">
          We couldn&rsquo;t load this order summary. Please try again.
        </p>
      </Shell>
    );
  }

  if (!order || !moneyMoved(order.status)) {
    return (
      <Shell>
        <p className="text-body-sm text-muted">
          {order
            ? "This order summary is available once payment is confirmed."
            : "We couldn't find that order."}
        </p>
        <Link href="/account/orders" className="mt-4 inline-block text-body-sm font-medium text-accent print:hidden">
          Back to orders
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-title font-semibold text-ink">Order summary</h1>
          <p className="mt-1 text-caption text-muted">
            This is an order summary, not a GST tax invoice.
          </p>
        </div>
        <PrintReceiptButton />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line-soft py-4 text-body-sm sm:grid-cols-4">
        <div>
          <dt className="text-caption text-muted">Order reference</dt>
          <dd className="nums font-mono text-ink">{order.reference}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted">Placed</dt>
          <dd className="text-ink">{DATE_FORMAT.format(order.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted">Paid</dt>
          <dd className="text-ink">{order.paidAt ? DATE_FORMAT.format(order.paidAt) : "—"}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted">Payment</dt>
          <dd className="text-ink">
            {order.payment ? `${order.payment.method ?? "—"} · ${PAYMENT_STATUS_LABEL[order.payment.status]}` : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <p className="text-caption font-medium text-ink">Ship to</p>
        <p className="mt-1 text-body-sm text-muted">
          {order.shipping.name ? `${order.shipping.name} · ` : ""}
          {order.shipping.phone}
        </p>
        <p className="text-body-sm text-muted">
          {order.shipping.line1}
          {order.shipping.line2 ? `, ${order.shipping.line2}` : ""}
          {order.shipping.landmark ? ` (${order.shipping.landmark})` : ""}
        </p>
        <p className="text-body-sm text-muted">
          {order.shipping.city}, {order.shipping.state} {order.shipping.pincode}
        </p>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="border-b border-line-soft text-micro uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Item</th>
              <th className="py-2 pr-3 font-medium">Variant</th>
              <th className="py-2 pr-3 text-right font-medium">Qty</th>
              <th className="py-2 pr-3 text-right font-medium">Unit price</th>
              <th className="py-2 pr-3 text-right font-medium">GST</th>
              <th className="py-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={`${line.variantId}-${line.sku}`} className="border-b border-line-hair last:border-0">
                <td className="py-2 pr-3 text-ink">{line.title}</td>
                <td className="py-2 pr-3 text-muted">{line.variantLabel}</td>
                <td className="nums py-2 pr-3 text-right">{line.qty}</td>
                <td className="nums py-2 pr-3 text-right">{formatPrice(line.unitPricePaise)}</td>
                <td className="nums py-2 pr-3 text-right text-muted">
                  {line.gstRatePct}% ({formatPrice(line.taxPaise)} incl.)
                </td>
                <td className="nums py-2 text-right font-medium text-ink">{formatPrice(line.linePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-body-sm">
        <MoneyRow label="Subtotal" value={formatPrice(order.subtotalPaise)} />
        {order.discountPaise > 0 && (
          <MoneyRow label="Discount" value={`− ${formatPrice(order.discountPaise)}`} />
        )}
        <MoneyRow label="GST (included in prices)" value={formatPrice(order.taxPaise)} muted />
        {order.deliveryFeePaise > 0 && <MoneyRow label="Delivery" value={formatPrice(order.deliveryFeePaise)} />}
        <MoneyRow label="Total paid" value={formatPrice(order.totalPaise)} strong />
      </div>

      <Link
        href={`/account/orders/${order.reference}`}
        className="mt-8 inline-block text-body-sm font-medium text-accent print:hidden"
      >
        Back to order
      </Link>
    </Shell>
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
        (strong ? "border-t border-line-hair pt-1.5 text-body font-semibold text-ink" : "")
      }
    >
      <span className={muted ? "text-muted" : "text-ink"}>{label}</span>
      <span className={muted ? "text-muted" : "text-ink"}>{value}</span>
    </div>
  );
}
