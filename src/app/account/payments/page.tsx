import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { CreditCard, Shield, Wallet } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/types/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payments — Quoin" };

export default async function PaymentsPage() {
  const session = await getSession();
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { walletPaise: true },
      })
    : null;

  return (
    <AccountShell
      current="/account/payments"
      title="Payments"
      subtitle="Your wallet, and the methods Quoin can take."
    >
      {!user ? (
        <SignInPrompt what="Signing in shows your wallet balance and saved payment methods." />
      ) : (
        <div className="space-y-4">
          <Card padding="lg" className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
              <Wallet className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="nums text-title font-semibold text-ink">
                {formatPrice(user.walletPaise)}
              </p>
              <p className="mt-0.5 text-caption text-muted">Wallet balance</p>
            </div>
          </Card>

          <EmptyState
            icon={<CreditCard className="size-6" />}
            title="No saved payment methods"
            action={{ href: "/products", label: "Browse the catalogue" }}
          >
            Quoin does not store card details, and card and UPI payment arrive
            with the payments module. Orders are confirmed with an expert on a
            call until then.
          </EmptyState>

          <Card className="flex items-start gap-3">
            <Shield className="mt-0.5 size-4.5 shrink-0 text-accent" />
            <p className="text-caption leading-relaxed text-muted">
              Quoin will never ask for a card number, a CVV or a UPI PIN over
              the phone. Anyone who does is not from Quoin.
            </p>
          </Card>
        </div>
      )}
    </AccountShell>
  );
}
