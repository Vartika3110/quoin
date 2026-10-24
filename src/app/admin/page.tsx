import Link from "next/link";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { DashboardPaymentBreakdown } from "@/components/admin/DashboardPaymentBreakdown";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import {
  Package,
  Rupee,
  Clock,
  Box,
  People,
  Headset,
} from "@/components/icons";
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
      {/* Above every other number on the page, and deliberately.

          A rejected webhook delivery means Razorpay tried to tell this
          deployment that a customer paid and could not prove it was
          Razorpay — the HMAC did not match `RAZORPAY_WEBHOOK_SECRET`. The
          payment succeeded; only the settlement was dropped. Nothing else
          on this dashboard shows it: orders-today still counts the order,
          revenue reads zero, and the whole page is consistent with a slow
          morning. That is how 45 of this application's first 46
          deliveries were rejected over weeks without anyone being told.

          `isRazorpayConfigured` now refuses to offer online payment when
          the secret is *missing*. A secret that is present and wrong
          cannot be detected before a delivery arrives and fails — this
          banner is that detection, and it is the reason it sits at the
          top rather than in a tile. */}
      {metrics.webhookRejections.count > 0 && (
        <div className="mb-4 rounded-card border border-danger bg-danger-wash p-4">
          <p className="text-body font-semibold text-danger">
            {metrics.webhookRejections.count} payment webhook
            {metrics.webhookRejections.count === 1 ? " was" : "s were"} rejected
            in the last 7 days
          </p>
          <p className="mt-1 text-caption leading-relaxed text-ink">
            Razorpay could not be verified, so those payments were never settled
            and their orders are still awaiting payment. Check that{" "}
            <code className="nums">RAZORPAY_WEBHOOK_SECRET</code> matches the
            secret on the webhook in the Razorpay dashboard, and that both are
            for the same mode (test or live).
            {metrics.webhookRejections.lastAcceptedAt
              ? ` The last delivery that verified was ${metrics.webhookRejections.lastAcceptedAt.toLocaleDateString(
                  "en-IN",
                  { day: "numeric", month: "short", year: "numeric" },
                )}.`
              : " No delivery has ever verified on this deployment."}
          </p>
        </div>
      )}

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
          hint="Captured payments only, GST-inclusive — includes money staff recorded offline, not tied to when the order was placed."
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
        <h2 className="font-display text-title-sm font-semibold text-ink">
          Payments today
        </h2>
        <p className="mt-1 text-body-sm text-muted">
          Every attempt to pay, by gateway status — not orders, so a checkout
          retried twice counts twice.
        </p>
        <div className="mt-4">
          <DashboardPaymentBreakdown
            breakdown={metrics.paymentBreakdownToday}
          />
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-caption">
        <Link href="/admin/orders/board" className="text-muted hover:text-ink">
          Open the order board
        </Link>
        <Link href="/admin/reports" className="text-muted hover:text-ink">
          This month’s report
        </Link>
      </div>
    </AdminShell>
  );
}
