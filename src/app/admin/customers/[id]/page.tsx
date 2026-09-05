import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Crown, Package, Pin, Wallet } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { resolveAdminPage } from "@/lib/data/admin-metrics";
import { formatPrice } from "@/lib/types/catalog";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/data/order-history";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customer — Quoin",
  robots: { index: false, follow: false },
};

const ADDRESS_LABEL: Record<string, string> = {
  HOME: "Home",
  WORK: "Work",
  SITE: "Site",
  OTHER: "Other",
};

/**
 * One customer, in full — the account, their addresses, and their orders.
 *
 * No projects panel. The brief for this section names one, but Project
 * Hub is still `localStorage`-only (`docs/production-audit.md`, MISSING
 * #2) — there is no `Project` table to query. A panel here would be an
 * empty box implying data exists somewhere for this customer when none
 * does; it lands when Project Hub moves to the database.
 *
 * The phone is shown in full here, unlike the masked list this page is
 * linked from — the reason to open one customer's record is usually to
 * act on it, and calling them back needs the real number.
 */
export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();
  const { id } = await params;

  const customer = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      tier: true,
      walletPaise: true,
      createdAt: true,
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!customer) notFound();

  const { page, pageSize, skip } = resolveAdminPage(
    Number(one((await searchParams).page)) || undefined,
  );

  const [orderTotal, spendAgg, orders] = await Promise.all([
    db.order.count({ where: { userId: id } }),
    db.order.aggregate({
      where: { userId: id, status: "PAID" },
      _sum: { totalPaise: true },
    }),
    db.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        reference: true,
        status: true,
        createdAt: true,
        totalPaise: true,
        _count: { select: { lines: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(orderTotal / pageSize));

  return (
    <AdminShell
      current="/admin/customers"
      title={customer.name ?? "Unnamed customer"}
      subtitle={customer.phone}
      actions={
        <Button href="/admin/customers" variant="outline" size="sm">
          Back to customers
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card padding="lg" className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            {customer.tier === "PRO" ? (
              <Badge tone="pro" icon={<Crown className="size-3" />}>
                Quoin Pro
              </Badge>
            ) : (
              <Badge>Standard account</Badge>
            )}
            <span className="nums text-caption text-muted">
              Joined{" "}
              {customer.createdAt.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-micro uppercase tracking-wide text-muted">Phone</dt>
              <dd className="nums mt-0.5 text-body-sm font-medium text-ink">
                {customer.phone}
              </dd>
            </div>
            <div>
              <dt className="text-micro uppercase tracking-wide text-muted">Orders</dt>
              <dd className="nums mt-0.5 text-body-sm font-medium text-ink">
                {orderTotal}
              </dd>
            </div>
            <div>
              <dt className="text-micro uppercase tracking-wide text-muted">
                Total spent
              </dt>
              <dd className="nums mt-0.5 text-body-sm font-medium text-ink">
                {formatPrice(spendAgg._sum.totalPaise ?? 0)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card padding="lg" className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
            <Wallet className="size-5" />
          </span>
          <div>
            <p className="nums text-title-sm font-semibold text-ink">
              {formatPrice(customer.walletPaise)}
            </p>
            <p className="text-caption text-muted">Wallet balance</p>
          </div>
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="text-title-sm font-semibold text-ink">Addresses</h2>
        {customer.addresses.length === 0 ? (
          <p className="mt-2 text-body-sm text-muted">No addresses saved.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {customer.addresses.map((address) => (
              <Card key={address.id} padding="md" tone="sunk">
                <div className="flex items-center gap-2">
                  <Pin className="size-3.5 text-muted" />
                  <span className="text-caption font-medium uppercase tracking-wide text-muted">
                    {ADDRESS_LABEL[address.label] ?? address.label}
                  </span>
                  {address.isDefault && (
                    <Badge size="sm" tone="accent">
                      Default
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-body-sm text-ink">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                  {address.landmark ? ` (near ${address.landmark})` : ""}
                </p>
                <p className="text-body-sm text-muted">
                  {address.city}, {address.state} {address.pincode}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-title-sm font-semibold text-ink">Orders</h2>
        {orders.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" />}
            title="No orders yet"
            compact
            className="mt-3"
          />
        ) : (
          <Card className="mt-3 overflow-hidden" padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead className="border-b border-line-soft bg-sunk text-micro uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Items</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.reference}
                      className="border-b border-line-hair last:border-0 hover:bg-hover"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${order.reference}`}
                          className="nums font-medium text-accent"
                        >
                          {order.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ORDER_STATUS_TONE[order.status]}>
                          {ORDER_STATUS_LABEL[order.status]}
                        </Badge>
                      </td>
                      <td className="nums px-4 py-3 text-right">
                        {order._count.lines}
                      </td>
                      <td className="nums px-4 py-3 text-right font-medium text-ink">
                        {formatPrice(order.totalPaise)}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {order.createdAt.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {totalPages > 1 && (
          <nav className="mt-4 flex items-center justify-center gap-3">
            {page > 1 ? (
              <Button
                href={`/admin/customers/${id}?page=${page - 1}`}
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
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Button
                href={`/admin/customers/${id}?page=${page + 1}`}
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
      </section>
    </AdminShell>
  );
}
