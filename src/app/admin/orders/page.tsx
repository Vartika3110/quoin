import Link from "next/link";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Package } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { one } from "@/lib/search-params";
import { maskPhone } from "@/lib/auth/phone";
import { formatPrice } from "@/lib/types/catalog";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
} from "@/lib/data/order-history";
import {
  listAdminOrders,
  listVendorOptions,
  parseIstDateFilter,
  parseOrderStatusFilter,
  parsePaymentStatusFilter,
} from "@/lib/data/admin-orders";
import { OrderStatusFilterForm } from "@/components/admin/OrderStatusFilterForm";
import { WhatsAppStatusBadge } from "@/components/admin/WhatsAppStatusBadge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders — Quoin",
  robots: { index: false, follow: false },
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The order queue.
 *
 * Filters are plain `?status=`/`?q=` query params, read here and nowhere
 * else — a filtered link is a link a colleague can be sent, and reloading
 * it must show the same rows. `parseOrderStatusFilter` falls back to
 * "unfiltered" for anything that is not a real `OrderStatus` rather than
 * erroring, matching how a stale `?page=` is already treated across this
 * app.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const sp = await searchParams;
  const status = parseOrderStatusFilter(one(sp.status));
  const paymentStatus = parsePaymentStatusFilter(one(sp.payment));
  const vendorId = one(sp.vendor)?.trim() || undefined;
  /* Echoed back to the form as typed, and separately parsed into instants
     for the query — a `to` of "7 Oct" has to become midnight IST on the
     8th to include the 7th, and the form must still show "7 Oct". */
  const fromRaw = one(sp.from)?.trim() || "";
  const toRaw = one(sp.to)?.trim() || "";
  const q = one(sp.q)?.trim() || "";
  const page = Number(one(sp.page)) || undefined;

  const [{ items, total, totalPages, page: currentPage }, vendors] = await Promise.all([
    listAdminOrders({
      status,
      paymentStatus,
      storeId: vendorId,
      from: parseIstDateFilter(fromRaw, "start"),
      to: parseIstDateFilter(toRaw, "end"),
      q,
      page,
    }),
    listVendorOptions(),
  ]);

  /* Carried onto every pagination link so "next page" does not silently
     drop the filters that got the staff member here. */
  const filterParams = new URLSearchParams();
  if (status) filterParams.set("status", status);
  if (paymentStatus) filterParams.set("payment", paymentStatus);
  if (vendorId) filterParams.set("vendor", vendorId);
  if (fromRaw) filterParams.set("from", fromRaw);
  if (toRaw) filterParams.set("to", toRaw);
  if (q) filterParams.set("q", q);
  const filterQuery = filterParams.toString() ? `${filterParams.toString()}&` : "";
  const anyFilter = filterParams.toString().length > 0;

  return (
    <AdminShell
      current="/admin/orders"
      title="Orders"
      subtitle={`${total} order${total === 1 ? "" : "s"}${status ? ` — ${ORDER_STATUS_LABEL[status]}` : ""}${q ? ` matching “${q}”` : ""}${anyFilter && !status && !q ? " matching these filters" : ""}.`}
      actions={
        <Button href="/admin/orders/board" variant="outline" size="sm">
          Order board
        </Button>
      }
    >
      <OrderStatusFilterForm
        status={status}
        paymentStatus={paymentStatus}
        vendorId={vendorId}
        from={fromRaw}
        to={toRaw}
        q={q}
        vendors={vendors}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" />}
          title={anyFilter ? "No order matches these filters." : "No orders yet."}
          className="mt-6"
        >
          {anyFilter && (
            <Link href="/admin/orders" className="text-accent">
              Clear filters
            </Link>
          )}
        </EmptyState>
      ) : (
        <Card className="mt-6 overflow-hidden" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-line-soft bg-sunk text-micro uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">WhatsApp</th>
                  <th className="px-4 py-3 text-right font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.reference}
                    className="border-b border-line-hair last:border-0 hover:bg-hover"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${row.reference}`}
                        className="nums font-medium text-ink hover:text-accent"
                      >
                        {row.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-ink">{row.customerName ?? "Unnamed"}</span>
                      <span className="nums block text-caption text-muted">
                        {row.customerPhone
                          ? maskPhone(row.customerPhone)
                          : (row.customerEmail ?? "—")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.vendorNames.length === 0 ? (
                        /* Not a missing vendor: this order reserved no
                           stock anywhere, so Quoin fulfils it itself. */
                        <span className="text-faint">Quoin</span>
                      ) : (
                        <>
                          <span className="block text-ink">{row.vendorNames.join(", ")}</span>
                          {row.vendorNames.length > 1 && (
                            <span className="nums block text-caption text-muted">
                              {row.vendorsDispatched} of {row.vendorNames.length} dispatched
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ORDER_STATUS_TONE[row.status]} size="sm">
                        {ORDER_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {row.paymentStatus ? PAYMENT_STATUS_LABEL[row.paymentStatus] : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <WhatsAppStatusBadge summary={row.whatsapp} />
                    </td>
                    <td className="nums px-4 py-3 text-right">{row.itemCount}</td>
                    <td className="nums px-4 py-3 text-right font-medium text-ink">
                      {formatPrice(row.totalPaise)}
                    </td>
                    <td className="px-4 py-3 text-muted">{DATE_FORMAT.format(row.createdAt)}</td>
                    <td className="px-4 py-3 text-muted">{DATE_FORMAT.format(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3">
          {currentPage > 1 ? (
            <Button
              href={`/admin/orders?${filterQuery}page=${currentPage - 1}`}
              variant="outline"
              size="sm"
            >
              Previous
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          <span className="nums text-caption text-muted">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Button
              href={`/admin/orders?${filterQuery}page=${currentPage + 1}`}
              variant="outline"
              size="sm"
            >
              Next
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </nav>
      )}
    </AdminShell>
  );
}
