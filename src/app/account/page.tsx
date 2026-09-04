import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { AccountSummary } from "@/components/storefront/account/AccountSummary";
import { AccountLinks } from "@/components/storefront/account/AccountLinks";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Crown, User, Wallet } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { maskPhone } from "@/lib/auth/phone";
import { formatPrice } from "@/lib/types/catalog";
import { listConsultRequestsForPhone } from "@/lib/data/consultations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Account — Quoin" };

/**
 * What the storefront actually knows about the person using it.
 *
 * Identity is the one module that is finished, so this shows the real
 * account rather than promising one. The phone is masked — a shoulder over
 * the counter at a site office reads a whole number off a screen as easily
 * as its owner does.
 */
export default async function AccountPage() {
  const session = await getSession();
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: {
          phone: true,
          name: true,
          tier: true,
          walletPaise: true,
          isStaff: true,
        },
      })
    : null;

  const [consultations, addressCount] = user
    ? await Promise.all([
        listConsultRequestsForPhone(user.phone, 5),
        db.address.count({ where: { userId: session!.userId } }),
      ])
    : [[], 0];

  return (
    <AccountShell
      current="/account"
      title="Account"
      subtitle={user ? undefined : "Sign in to keep your orders and addresses together."}
    >
      {!user ? (
        <SignInPrompt what="Signing in saves your addresses, keeps your orders together and shows the consultations you have booked." />
      ) : (
        <div className="space-y-6">
          <Card padding="lg" className="flex flex-wrap items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
              <User className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-title-sm font-semibold text-ink">
                {user.name ?? maskPhone(user.phone)}
              </p>
              <p className="nums mt-0.5 text-caption text-muted">
                {user.name ? maskPhone(user.phone) : "Signed in"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {user.tier === "PRO" ? (
                  <Badge tone="pro" icon={<Crown className="size-3" />}>
                    Quoin Pro
                  </Badge>
                ) : (
                  <Badge>Standard account</Badge>
                )}
                {user.isStaff && <Badge tone="info">Staff</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-right">
                <span className="nums block text-title font-semibold text-ink">
                  {formatPrice(user.walletPaise)}
                </span>
                <span className="flex items-center justify-end gap-1 text-micro text-muted">
                  <Wallet className="size-3" />
                  Wallet
                </span>
              </span>
            </div>
          </Card>

          {/* Counts that only the browser knows — projects and saved
              products live in local storage until accounts own them — are
              rendered client-side. Everything the server knows is passed
              in, so the two halves of this row agree.

              Desktop only: on a phone the same destinations are the list
              below, which is faster to scan and faster to hit. */}
          <div className="hidden lg:block">
            <AccountSummary
              consultationCount={consultations.length}
              addressCount={addressCount}
            />
          </div>

          <AccountLinks />

          {user.tier !== "PRO" && (
            <Card tone="deep" padding="lg" className="flex flex-wrap items-center gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-pro/15 text-pro">
                <Crown className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-on-deep">
                  Buying for a living?
                </p>
                <p className="mt-0.5 text-caption text-on-deep/70">
                  Pro gives trade pricing, priority dispatch and a project
                  manager.
                </p>
              </div>
              <Button href="/pro" variant="pro">
                See Quoin Pro
              </Button>
            </Card>
          )}

          {user.isStaff && (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-body font-semibold text-ink">Internal tools</p>
                <p className="mt-0.5 text-caption text-muted">
                  Pricing and product imagery.
                </p>
              </div>
              <div className="flex gap-2">
                <Button href="/admin/pricing" variant="outline" size="sm">
                  Pricing
                </Button>
                <Button href="/admin/images" variant="outline" size="sm">
                  Images
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </AccountShell>
  );
}
