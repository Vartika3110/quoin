import Link from "next/link";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Button } from "@/components/ui/Button";
import { Package, Rupee, Truck, Calculator } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { one } from "@/lib/search-params";
import { formatPrice } from "@/lib/types/catalog";
import { ORDER_STATUS_LABEL } from "@/lib/data/order-history";
import { getMonthlyReport, parseMonthParam, resolveIstMonthRangeUtc } from "@/lib/data/admin-metrics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reports — Quoin",
  robots: { index: false, follow: false },
};

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  month: "long",
  year: "numeric",
});

function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
  return MONTH_LABEL_FORMAT.format(resolveIstMonthRangeUtc(year, month).start);
}

function adjacentMonth(year: number, month: number, delta: 1 | -1): { year: number; month: number } {
  const absolute = year * 12 + (month - 1) + delta;
  return { year: Math.floor(absolute / 12), month: (absolute % 12) + 1 };
}

/**
 * "How many orders this month, and how much" — month grain beside the
 * dashboard's today. `?month=` is the only state, so a link to a specific
 * month survives a reload and can be sent to whoever asked for the
 * figure.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const sp = await searchParams;
  const now = new Date();
  const { year, month } = parseMonthParam(one(sp.month), now);
  const currentMonth = parseMonthParam(undefined, now);
  const isCurrentMonth = year === currentMonth.year && month === currentMonth.month;

  const { current: stats, recentMonths, statusBreakdown } = await getMonthlyReport(year, month);

  const prev = adjacentMonth(year, month, -1);
  const next = adjacentMonth(year, month, 1);

  return (
    <AdminShell current="/admin/reports" title="Reports" subtitle={monthLabel(year, month)}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button href={`/admin/reports?month=${monthParam(prev.year, prev.month)}`} variant="outline" size="sm">
          ← {monthLabel(prev.year, prev.month)}
        </Button>
        {isCurrentMonth ? (
          <Button variant="outline" size="sm" disabled>
            Next month →
          </Button>
        ) : (
          <Button href={`/admin/reports?month=${monthParam(next.year, next.month)}`} variant="outline" size="sm">
            {monthLabel(next.year, next.month)} →
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          label="Orders placed"
          value={<span className="nums">{stats.ordersPlaced}</span>}
          hint="Excludes abandoned online checkouts that never got paid."
          icon={<Package className="size-4" />}
        />
        <Stat
          label="Order value"
          value={formatPrice(stats.orderValuePaise)}
          hint="GST-inclusive. Includes orders not yet paid."
          icon={<Rupee className="size-4" />}
          tone="accent"
        />
        <Stat
          label="Total received"
          value={formatPrice(stats.totalReceivedPaise)}
          hint="GST-inclusive. Online and offline payments together."
          icon={<Rupee className="size-4" />}
        />
        <Stat
          label="Paid online"
          value={formatPrice(stats.paidOnlinePaise)}
          hint="Captured by Razorpay."
          icon={<Rupee className="size-4" />}
        />
        <Stat
          label="Received offline"
          value={formatPrice(stats.receivedOfflinePaise)}
          hint="Recorded by staff — UPI, cash or bank transfer taken by phone."
          icon={<Rupee className="size-4" />}
        />
        <Stat
          label="Delivered"
          value={<span className="nums">{stats.deliveredCount}</span>}
          icon={<Truck className="size-4" />}
        />
        <Stat
          label="Average order"
          value={stats.averageOrderPaise == null ? "—" : formatPrice(stats.averageOrderPaise)}
          icon={<Calculator className="size-4" />}
        />
      </div>

      <Card padding="lg" className="mt-6 overflow-hidden">
        <CardHeader title="Last 6 months" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="border-b border-line-soft text-micro uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">Month</th>
                <th className="py-2 pr-4 text-right font-medium">Orders</th>
                <th className="py-2 pr-4 text-right font-medium">Order value</th>
                <th className="py-2 text-right font-medium">Received (online / offline)</th>
              </tr>
            </thead>
            <tbody>
              {recentMonths.map((row) => {
                const selected = row.year === year && row.month === month;
                return (
                  <tr
                    key={monthParam(row.year, row.month)}
                    className={
                      "border-b border-line-hair last:border-0" + (selected ? " bg-accent-wash" : "")
                    }
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/admin/reports?month=${monthParam(row.year, row.month)}`}
                        className={selected ? "font-medium text-accent" : "text-ink hover:text-accent"}
                      >
                        {monthLabel(row.year, row.month)}
                      </Link>
                    </td>
                    <td className="nums py-2 pr-4 text-right text-ink">{row.ordersPlaced}</td>
                    <td className="nums py-2 pr-4 text-right text-ink">{formatPrice(row.orderValuePaise)}</td>
                    <td className="nums py-2 text-right text-ink">
                      {formatPrice(row.paidOnlinePaise)}
                      <span className="text-muted"> / </span>
                      {formatPrice(row.receivedOfflinePaise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding="lg" className="mt-6">
        <CardHeader title="By status" subtitle={monthLabel(year, month)} />
        {statusBreakdown.length === 0 ? (
          <p className="text-body-sm text-muted">No orders placed this month.</p>
        ) : (
          <ul className="space-y-2">
            {statusBreakdown.map((row) => (
              <li key={row.status} className="flex items-center justify-between text-body-sm">
                <span className="text-ink">{ORDER_STATUS_LABEL[row.status]}</span>
                <span className="nums text-muted">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AdminShell>
  );
}
