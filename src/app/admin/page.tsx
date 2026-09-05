import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { DashboardPaymentBreakdown } from "@/components/admin/DashboardPaymentBreakdown";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Package, Rupee, Clock, Box, People, Headset } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { getDashboardMetrics } from "@/lib/data/admin-metrics";
import { formatPrice } from "@/lib/types/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — Quoin",
  robots: { index: false, follow: false },
};

/**
 * What a person opening this in the morning actually needs.
 *
 * Every figure here answers to `docs/production-audit.md` phase 4a
 * directly — see `src/lib/data/admin-metrics.ts` for the rules that keep
 * them honest (revenue is captured money only, "today" is the Indian day,
 * a zero low-stock count is not the same claim as "all good"). Nothing on
 * this page is computed here; it only renders what that module returned.
 */
export default async function AdminDashboardPage() {
  await requireStaffPage();
  const metrics = await getDashboardMetrics();

  const lowStockHint =
    metrics.lowStock.tracked === 0
      ? "Nothing is stock-tracked yet — inventory is opt-in, so this is not the same as “all good”."
      : `${metrics.lowStock.tracked} product${metrics.lowStock.tracked === 1 ? "" : "s"} tracked` +
        (metrics.lowStock.low > 0
          ? ` — ${metrics.lowStock.low} at or under its threshold.`
          : " — none at or under threshold.");

  return (
    <AdminShell
      current="/admin"
      title="Dashboard"
      subtitle="Today, in Indian Standard Time."
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          label="Orders today"
          value={<span className="nums">{metrics.ordersToday}</span>}
          hint="Placed since midnight IST, every status."
          icon={<Package className="size-4" />}
          href="/admin/orders"
        />
        <Stat
          label="Revenue today"
          value={formatPrice(metrics.revenueTodayPaise)}
          hint="Captured payments only, GST-inclusive — not tied to when the order was placed."
          icon={<Rupee className="size-4" />}
          tone="accent"
        />
        <Stat
          label="Awaiting action"
          value={<span className="nums">{metrics.ordersAwaitingAction}</span>}
          hint="Paid, confirmed, processing, packed, or refund-pending."
          icon={<Clock className="size-4" />}
          href="/admin/orders"
          tone={metrics.ordersAwaitingAction > 0 ? "accent" : "plain"}
        />
        {/* Set beside "Awaiting action" rather than folded into it: these
            are the orders that promised a phone call, and while the
            gateway is unconfigured they are the only work there is. A
            dashboard that showed staff a zero here would be hiding the
            whole queue. */}
        <Stat
          label="Awaiting callback"
          value={<span className="nums">{metrics.ordersAwaitingCallback}</span>}
          hint="Confirmed with an expert, no payment taken yet — someone has to phone."
          icon={<Headset className="size-4" />}
          href="/admin/orders?status=PENDING_PAYMENT"
          tone={metrics.ordersAwaitingCallback > 0 ? "accent" : "plain"}
        />
        <Stat
          label="Low stock"
          value={<span className="nums">{metrics.lowStock.low}</span>}
          hint={lowStockHint}
          icon={<Box className="size-4" />}
          href="/admin/inventory"
          tone={metrics.lowStock.low > 0 ? "accent" : "plain"}
        />
        <Stat
          label="Customers"
          value={<span className="nums">{metrics.totalCustomers}</span>}
          icon={<People className="size-4" />}
          href="/admin/customers"
        />
      </div>

      <Card padding="lg" className="mt-6">
        <h2 className="text-title-sm font-semibold text-ink">Payments today</h2>
        <p className="mt-1 text-body-sm text-muted">
          Every attempt to pay, by gateway status — not orders, so a checkout
          retried twice counts twice.
        </p>
        <div className="mt-4">
          <DashboardPaymentBreakdown breakdown={metrics.paymentBreakdownToday} />
        </div>
      </Card>
    </AdminShell>
  );
}
