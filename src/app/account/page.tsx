import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { AccountLinks } from "@/components/storefront/account/AccountLinks";
import { LogOutButton } from "@/components/storefront/account/LogOutButton";
import { LoadError } from "@/components/storefront/account/LoadError";
import { ProjectsCard } from "@/components/storefront/account/dashboard/ProjectsCard";
import { OrdersCard } from "@/components/storefront/account/dashboard/OrdersCard";
import { ServicesCard } from "@/components/storefront/account/dashboard/ServicesCard";
import { SavedCard } from "@/components/storefront/account/dashboard/SavedCard";
import { DocumentsCard } from "@/components/storefront/account/dashboard/DocumentsCard";
import { ProCard } from "@/components/storefront/account/dashboard/ProCard";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Crown, User } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deliveryPhoneFor, maskPhone } from "@/lib/auth/phone";
import { firstName, greetingFor } from "@/lib/account/greeting";
import { getAccountOverview, type AccountOverview } from "@/lib/data/account-overview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Account — Quoin" };

/**
 * The account command centre.
 *
 * One read (`getAccountOverview`) answers every card on this page — the
 * active projects, the latest order, the next service, the document
 * count and, for a Pro account, the four figures underneath it — so the
 * dashboard and the mobile list below it can never show two different
 * counts for the same thing. Address count is the one figure kept
 * outside that read: it belongs to no card here, only to `AccountLinks`'
 * row list, and folding it into the overview type would mean every other
 * caller of `getAccountOverview` carries a query it never asked for.
 */
export default async function AccountPage() {
  const session = await getSession();

  if (!session) {
    return (
      <AccountShell
        current="/account"
        title="Account"
        subtitle="Sign in to keep your orders and addresses together."
      >
        <SignInPrompt
          what="Signing in saves your addresses, keeps your orders together and shows what you have booked."
          next="/account"
        />
      </AccountShell>
    );
  }

  let overview: AccountOverview;
  let addressCount: number;
  try {
    [overview, addressCount] = await Promise.all([
      getAccountOverview(session.userId),
      db.address.count({ where: { userId: session.userId } }),
    ]);
  } catch (error) {
    console.error("[account] failed to load the account overview", error);
    return (
      <AccountShell current="/account" title="Account">
        <LoadError title="We couldn't load your account." />
      </AccountShell>
    );
  }

  const { user } = overview;
  const isPro = user.tier === "PRO";

  return (
    <AccountShell
      current="/account"
      title={`${greetingFor(new Date())}, ${firstName(user.name) ?? "there"}`}
      subtitle="Manage your orders, projects, services and documents in one place."
    >
      <TrackEvent event="account_viewed" props={{ tier: user.tier }} />

      <div className="space-y-6">
        {!deliveryPhoneFor(user) && (
          <Card padding="lg" className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink">
                Add a phone for deliveries
              </p>
              <p className="mt-0.5 text-caption text-muted">
                We need a number to reach you when an order is on its way.
              </p>
            </div>
            <Button href="/account/settings" variant="outline" size="sm">
              Add phone
            </Button>
          </Card>
        )}

        <Card padding="lg" className="flex flex-wrap items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
            <User className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-title-sm font-semibold text-ink">
              {user.name ?? user.email ?? (user.phone ? maskPhone(user.phone) : "Signed in")}
            </p>
            <p className="nums mt-0.5 text-caption text-muted">
              {user.name
                ? (user.email ?? (user.phone ? maskPhone(user.phone) : "Signed in"))
                : user.phone
                  ? maskPhone(user.phone)
                  : "Signed in"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {isPro ? (
                <Badge tone="pro" icon={<Crown className="size-3" />}>
                  Quoin Pro
                </Badge>
              ) : (
                <Badge>Standard account</Badge>
              )}
              {user.isStaff && <Badge tone="info">Staff</Badge>}
            </div>
          </div>
          <Button href="/account/settings" variant="outline" size="sm">
            Edit
          </Button>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ProjectsCard
            activeProjectCount={overview.projects.activeProjectCount}
            top={overview.projects.top}
          />
          <OrdersCard
            activeOrderCount={overview.orders.activeOrderCount}
            latestOrder={overview.orders.latestOrder}
          />
          <ServicesCard
            upcomingServiceCount={overview.services.upcomingServiceCount}
            nextService={overview.services.nextService}
          />
          <SavedCard />
          <DocumentsCard count={overview.documents.count} />
          <ProCard pro={overview.pro} />
        </div>

        {/* The same destinations as the cards above, as a list that is
            faster to scan and faster to hit on a phone — see the doc
            comment on `AccountLinks`. Hides itself at `lg`. */}
        <AccountLinks
          activeProjectCount={overview.projects.activeProjectCount}
          activeOrderCount={overview.orders.activeOrderCount}
          upcomingServiceCount={overview.services.upcomingServiceCount}
          documentCount={overview.documents.count}
          addressCount={addressCount}
          walletPaise={user.walletPaise}
          isPro={isPro}
        />

        {user.isStaff && (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-body font-semibold text-ink">Internal tools</p>
              <p className="mt-0.5 text-caption text-muted">
                The admin console, pricing and product imagery.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button href="/admin" variant="outline" size="sm">
                Admin
              </Button>
              <Button href="/admin/pricing" variant="outline" size="sm">
                Pricing
              </Button>
              <Button href="/admin/images" variant="outline" size="sm">
                Images
              </Button>
            </div>
          </Card>
        )}

        <LogOutButton />
      </div>
    </AccountShell>
  );
}
