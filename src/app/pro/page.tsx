import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SectionHead, PageSections } from "@/components/ui/Section";
import {
  Briefcase,
  CheckCircle,
  Crown,
  Document,
  Headset,
  Package,
  Refresh,
  Rupee,
  Truck,
} from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quoin Pro — Quoin",
  description:
    "Trade pricing, priority dispatch and a dedicated project manager for people who buy for a living.",
};

/**
 * Quoin Pro.
 *
 * Pro rates already exist in the catalogue — `proPricePaise` sits on every
 * variant that has one, and `resolvePrice` applies it. What does not exist
 * is a way to become a member, so the page says what Pro does, shows what
 * it is worth against the real catalogue, and asks for a callback rather
 * than showing a payment form that leads nowhere.
 *
 * No price is printed on it. Nobody in the business has set a membership
 * fee, and inventing one on a page that says "trade pricing" would be the
 * least credible number on the site.
 */
const BENEFITS = [
  {
    Icon: Rupee,
    title: "Trade pricing",
    detail:
      "Pro rates apply automatically at checkout on every line that has one — no code to remember, no minimum order.",
  },
  {
    Icon: Truck,
    title: "Priority dispatch",
    detail:
      "Scheduled deliveries are loaded first, which is the difference between a slab arriving before the mason and after him.",
  },
  {
    Icon: Briefcase,
    title: "A dedicated project manager",
    detail:
      "One person who knows your sites, rather than whoever picks up the phone.",
  },
  {
    Icon: Package,
    title: "Bulk ordering",
    detail:
      "Price a whole bill of quantities in one go and order it against a project.",
  },
  {
    Icon: Refresh,
    title: "Repeat orders",
    detail:
      "Re-order a previous list to a new site without rebuilding it line by line.",
  },
  {
    Icon: Document,
    title: "Invoices and documents",
    detail:
      "GST invoices per project, kept where your accountant can find them.",
  },
];

const FOR = [
  "Architects specifying to a drawing",
  "Interior designers pricing a scheme",
  "Contractors buying for several sites",
  "Builders ordering by the tonne",
];

export default async function ProPage() {
  const session = await getSession();
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { tier: true },
      })
    : null;

  const alreadyPro = user?.tier === "PRO";

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb
            items={[{ label: "Home", href: "/" }, { label: "Quoin Pro" }]}
          />
        </div>

        <PageSections>
          <section className="px-5 lg:px-0">
            <div className="overflow-hidden rounded-card bg-deep p-6 lg:rounded-2xl lg:p-12">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pro/15 px-3 py-1 text-eyebrow uppercase text-pro">
                <Crown className="size-3.5" />
                Quoin Pro
              </span>

              <h1 className="mt-5 max-w-2xl text-headline font-semibold text-on-deep lg:text-display-sm">
                Built for people who buy for a living.
              </h1>
              <p className="mt-4 max-w-xl text-body-lg leading-relaxed text-on-deep/70">
                Architects, contractors and builders order differently —
                larger, more often, and against a deadline. Pro is priced and
                dispatched for that.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {alreadyPro ? (
                  <Badge tone="pro" icon={<CheckCircle className="size-3.5" />}>
                    You are a Pro member
                  </Badge>
                ) : (
                  <>
                    <Button href="/consult" variant="pro" size="lg">
                      Talk to us about Pro
                    </Button>
                    <Button href="/products" size="lg" variant="ghost" className="text-on-deep/80 hover:bg-white/10 hover:text-on-deep">
                      See the catalogue
                    </Button>
                  </>
                )}
              </div>
            </div>
          </section>

          <section>
            <SectionHead
              title="What membership includes"
              subtitle="Six things, each of which changes how an order actually runs."
            />
            <div className="grid gap-3 px-5 sm:grid-cols-2 lg:grid-cols-3 lg:px-0">
              {BENEFITS.map(({ Icon, title, detail }) => (
                <Card key={title} padding="lg">
                  <span className="grid size-10 place-items-center rounded-lg bg-pro-wash text-pro">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-body font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-caption leading-relaxed text-muted">
                    {detail}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <section className="px-5 lg:px-0">
            <Card padding="lg" className="lg:flex lg:items-center lg:gap-10">
              <div className="min-w-0 flex-1">
                <h2 className="text-title font-semibold text-ink">Who it is for</h2>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {FOR.map((who) => (
                    <li key={who} className="flex items-start gap-2">
                      <CheckCircle className="mt-0.5 size-4 shrink-0 text-pro" />
                      <span className="text-body-sm text-muted">{who}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 shrink-0 lg:mt-0">
                <Button href="/consult" variant="pro" size="lg">
                  <Headset className="size-4" />
                  Ask about Pro
                </Button>
              </div>
            </Card>
          </section>

          <section className="px-5 lg:px-0">
            <Card>
              <p className="text-caption leading-relaxed text-muted">
                Pro rates already sit against the products that have them, and
                are applied automatically once an account is on the Pro tier.
                Membership pricing has not been set, so this page does not
                print one — an invented figure on the page that promises trade
                pricing would be the least credible number on the site.
              </p>
            </Card>
          </section>
        </PageSections>
      </div>
    </AppShell>
  );
}
