import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Briefcase, Cart, Crown, Layers, Refresh, Rupee } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";
import { DashboardCardHead } from "@/components/storefront/account/dashboard/DashboardCardHead";
import type { AccountOverviewPro } from "@/lib/data/account-overview";

/**
 * What membership actually does, today — not what a future roadmap might
 * add. Every line below is backed by a real code path: `proPricePaise`/
 * `PriceTier` (`prisma/schema.prisma`, `resolvePrice` in
 * `src/lib/types/catalog.ts`), `BuyAgainButton`
 * (`src/components/storefront/orders/BuyAgainButton.tsx`), the `Project`
 * tables, `ServiceBooking` quotes, and `parseParcha` matching a typed or
 * uploaded list to real SKUs. `docs/design-system.md` is explicit that a
 * fabricated capability next to a real catalogue makes every other number
 * on the page suspect, so nothing here promises speed or a discount
 * nothing backs.
 */
const BENEFITS: { Icon: typeof Rupee; title: string; detail: string }[] = [
  {
    Icon: Rupee,
    title: "Pro and volume pricing",
    detail: "Trade rates apply automatically on every line that has one.",
  },
  {
    Icon: Refresh,
    title: "Repeat orders",
    detail: "Buy Again re-adds a past order's lines to your cart in one tap.",
  },
  {
    Icon: Layers,
    title: "Project management",
    detail: "Track budget, tasks and every order against one site.",
  },
  {
    Icon: Briefcase,
    title: "Service quotations",
    detail: "Request and accept priced quotes for site work.",
  },
  {
    Icon: Cart,
    title: "Parcha to cart",
    detail: "Turn a typed or photographed materials list into priced lines.",
  },
];

export function ProCard({ pro }: { pro: AccountOverviewPro | null }) {
  if (!pro) {
    return (
      <Card padding="lg" className="anim-rise flex h-full flex-col">
        <DashboardCardHead icon={<Crown className="size-4.5" />} title="Quoin Pro" tone="pro" />
        <p className="mt-3 font-display text-body font-semibold text-ink">
          Built for professionals
        </p>
        <ul className="mt-3 flex-1 space-y-2.5">
          {BENEFITS.map(({ Icon, title, detail }) => (
            <li key={title} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 size-3.5 shrink-0 text-pro" />
              <span className="text-caption leading-relaxed text-muted">
                <span className="font-medium text-ink">{title}.</span> {detail}
              </span>
            </li>
          ))}
        </ul>
        <Button href="/pro" variant="pro" size="sm" className="mt-4 self-start">
          Explore Quoin Pro
        </Button>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="anim-rise flex h-full flex-col">
      <DashboardCardHead icon={<Crown className="size-4.5" />} title="Quoin Pro" tone="pro" />
      <dl className="nums mt-4 grid flex-1 grid-cols-2 gap-4">
        <Figure label="Active projects" value={String(pro.activeProjectCount)} />
        <Figure label="Monthly spend" value={formatPrice(pro.monthlySpendPaise)} />
        <Figure label="Pending quotations" value={String(pro.pendingQuotationCount)} />
        <Figure label="Upcoming deliveries" value={String(pro.upcomingDeliveryCount)} />
      </dl>
      <Button href="/pro" variant="pro" size="sm" className="mt-4 self-start">
        Explore Quoin Pro
      </Button>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-muted">{label}</dt>
      <dd className="mt-0.5 text-body font-semibold text-ink">{value}</dd>
    </div>
  );
}
