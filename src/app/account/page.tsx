import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { SectionHead } from "@/components/storefront/sections";
import { Chevron, User, Wallet } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { maskPhone } from "@/lib/auth/phone";
import { formatPrice } from "@/lib/types/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Account — Quoin" };

/**
 * What the storefront actually knows about the person using it.
 *
 * Deliberately not a placeholder: identity is the one module that is
 * finished, so this shows the real account rather than promising one. The
 * phone is masked — a shoulder over the counter at a site office reads a
 * whole number off a screen as easily as its owner does.
 */
export default async function AccountPage() {
  const session = await getSession();
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { phone: true, name: true, tier: true, walletPaise: true, isStaff: true },
      })
    : null;

  return (
    <AppShell>
      <div className="pt-4 lg:pt-0">
        <SectionHead title="Account" />

        {!user ? (
          <div className="mx-5 rounded-card border border-line-soft bg-surface px-6 py-10 text-center lg:mx-0">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-wash text-accent">
              <User className="size-6" />
            </span>
            <p className="mt-4 text-sm text-ink">You are not signed in</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
              Signing in saves your addresses and keeps your orders together.
              We send a code to your phone — there is no password to forget.
            </p>
          </div>
        ) : (
          <div className="mx-5 space-y-3 lg:mx-0">
            <div className="flex items-center gap-4 rounded-card border border-line-soft bg-surface px-4 py-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
                <User className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ink">{user.name ?? maskPhone(user.phone)}</p>
                <p className="text-xs text-muted">
                  {user.tier === "PRO" ? "Quoin Pro member" : "Standard account"}
                  {user.isStaff ? " · staff" : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-card border border-line-soft bg-surface px-4 py-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
                <Wallet className="size-6" />
              </span>
              <div>
                <p className="text-sm text-ink">{formatPrice(user.walletPaise)}</p>
                <p className="text-xs text-muted">Wallet balance</p>
              </div>
            </div>

            {user.isStaff && (
              <Link
                href="/admin/pricing"
                className="flex items-center justify-between rounded-card border border-line-soft bg-surface px-4 py-4 transition-colors hover:border-accent-edge"
              >
                <span className="text-sm text-ink">Internal tools</span>
                <Chevron className="size-4 text-muted" />
              </Link>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
