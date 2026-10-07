import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Package } from "@/components/icons";
import { VendorDispatchButton } from "@/components/vendor/VendorDispatchButton";
import { getFulfilmentByToken } from "@/lib/data/order-fulfilments";
import { formatPrice } from "@/lib/types/catalog";
import { FULFILMENT_LABEL } from "@/lib/data/admin-orders";

/** Never indexed, never cached, never prefetched into a shared cache. A
    URL that is a credential must not end up anywhere a URL normally
    ends up. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quoin order",
  robots: { index: false, follow: false, nocache: true },
};

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The vendor's page: one order, their items, one button.
 *
 * Reached only from the link in the new-order WhatsApp. The token in the
 * URL is the whole credential — there is no vendor account system in this
 * app, and inventing one would be a second authentication surface to get
 * wrong — so this page is built on the assumption that whoever holds the
 * link may see exactly one fulfilment and nothing else.
 *
 * That assumption is enforced by the query, not by this file:
 * `getFulfilmentByToken` projects the named leg's lines alone and carries
 * no account id, no email and no order history. What it cannot select
 * cannot leak here, which is a stronger guarantee than remembering not
 * to render something.
 *
 * Wears no shell. Not the admin frame — a shopkeeper is not staff and
 * must not be shown a nav into internal tools — and not the storefront's
 * either, whose cart and area picker mean nothing to them. Just the
 * design system's own cards on a plain page, which is also the shape that
 * reads best in WhatsApp's in-app browser on a phone.
 */
export default async function VendorOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const fulfilment = await getFulfilmentByToken(token);

  /* One empty state for "no such token" and for "a token that is no
     longer any good", deliberately indistinguishable — a holder who
     cannot prove they have a live assignment is not told whether one
     exists. Rendered in-page rather than `notFound()` so a vendor on a
     phone gets a sentence they can act on instead of a 404. */
  if (!fulfilment) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <EmptyState
          icon={<Package className="size-6" />}
          title="This dispatch link is not valid."
        >
          <p className="text-body-sm text-muted">
            It may have been replaced by a newer message, or the order may have been cancelled.
            Please check your latest WhatsApp from Quoin, or call us.
          </p>
        </EmptyState>
      </main>
    );
  }

  const cancelled = fulfilment.orderStatus === "CANCELLED" || fulfilment.status === "CANCELLED";
  const dispatched = fulfilment.status === "DISPATCHED";

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <header className="mb-6">
        <p className="text-caption uppercase tracking-wide text-muted">Quoin order</p>
        <h1 className="nums font-display text-title-lg font-semibold text-ink">
          #{fulfilment.orderReference}
        </h1>
        <p className="mt-1 text-body-sm text-muted">
          For {fulfilment.storeName} · received{" "}
          {DATE_TIME_FORMAT.format(fulfilment.createdAt)}
        </p>
        <Badge
          tone={cancelled ? "danger" : dispatched ? "success" : "warning"}
          className="mt-3"
        >
          {cancelled ? "Cancelled — do not send" : dispatched ? "Dispatched" : "New order"}
        </Badge>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Items to send"
            subtitle={`${fulfilment.lines.length} line${fulfilment.lines.length === 1 ? "" : "s"} — your store only`}
          />
          <ul className="space-y-3">
            {fulfilment.lines.map((line) => (
              <li
                key={line.sku}
                className="flex items-start justify-between gap-3 border-b border-line-hair pb-3 text-body-sm last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-ink">
                    <span className="nums font-semibold">{line.qty} ×</span> {line.title}
                  </p>
                  <p className="nums mt-0.5 text-caption text-muted">
                    {line.variantLabel} · SKU {line.sku} · {FULFILMENT_LABEL[line.fulfilment]}
                  </p>
                </div>
                <span className="nums shrink-0 text-ink">{formatPrice(line.linePaise)}</span>
              </li>
            ))}
          </ul>
          <p className="nums mt-3 border-t border-line-hair pt-3 text-body font-semibold text-ink">
            {/* This store's share. Deliberately not the order total: on a
                split order that figure belongs to Quoin and the customer,
                not to one of several vendors. */}
            Your total {formatPrice(fulfilment.subtotalPaise)}
          </p>
        </Card>

        <Card>
          <CardHeader title="Deliver to" />
          <p className="text-body-sm text-ink">{fulfilment.delivery.name}</p>
          <p className="nums text-body-sm text-muted">
            <a href={`tel:${fulfilment.delivery.phone}`} className="text-accent">
              {fulfilment.delivery.phone}
            </a>
          </p>
          <p className="mt-2 text-body-sm text-muted">
            {fulfilment.delivery.line1}
            {fulfilment.delivery.line2 ? `, ${fulfilment.delivery.line2}` : ""}
            {fulfilment.delivery.landmark ? ` (near ${fulfilment.delivery.landmark})` : ""}
          </p>
          <p className="text-body-sm text-muted">
            {fulfilment.delivery.city}, {fulfilment.delivery.state} {fulfilment.delivery.pincode}
          </p>
        </Card>

        {cancelled ? (
          <p className="rounded-lg bg-danger-wash px-4 py-3 text-body-sm text-danger">
            This order has been cancelled. Please do not send it. If you have already dispatched
            it, call Quoin.
          </p>
        ) : dispatched ? (
          <p className="rounded-lg bg-success-wash px-4 py-3 text-body-sm text-success">
            Marked as dispatched
            {fulfilment.dispatchedAt
              ? ` on ${DATE_TIME_FORMAT.format(fulfilment.dispatchedAt)}`
              : ""}
            . Nothing further is needed from you — thank you.
          </p>
        ) : (
          <div className="space-y-2">
            <VendorDispatchButton token={token} />
            <p className="text-caption text-muted">
              Press this once the items have left your store. The customer is told automatically.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
