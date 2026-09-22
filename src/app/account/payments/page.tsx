import type { Metadata } from "next";
import type { PaymentStatus } from "@prisma/client";
import Link from "next/link";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { LoadError } from "@/components/storefront/account/LoadError";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CreditCard, Shield, Wallet } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/types/catalog";
import {
  listPaymentsForUser,
  paymentMethodLabel,
  paymentStatusLabel,
  paymentTransactionId,
  type PaymentHistoryRow,
} from "@/lib/data/payment-history";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payments — Quoin" };

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Mirrors `Badge`'s own tone union structurally rather than importing it
    — that component does not export a `Tone` type, matching the same
    trade-off `OrderStatusTone` makes (`src/lib/data/order-history.ts`).
    Same coarse four-way reading `paymentStatusLabel` collapses the real
    `PaymentStatus` enum into — see its own comment
    (`src/lib/data/payment-history.ts`). */
type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "pro" | "deep";

const STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  CREATED: "warning",
  AUTHORIZED: "warning",
  CAPTURED: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export default async function PaymentsPage() {
  const session = await getSession();

  if (!session) {
    return (
      <AccountShell current="/account/payments" title="Payments" subtitle="Your wallet, and the methods Quoin can take.">
        <SignInPrompt
          what="Signing in shows your wallet balance and your payment history."
          next="/account/payments"
        />
      </AccountShell>
    );
  }

  let walletPaise: number | null = null;
  let payments: PaymentHistoryRow[] = [];
  try {
    const [user, rows] = await Promise.all([
      db.user.findUnique({ where: { id: session.userId }, select: { walletPaise: true } }),
      listPaymentsForUser(session.userId),
    ]);
    walletPaise = user?.walletPaise ?? 0;
    payments = rows;
  } catch (error) {
    console.error("[account/payments] failed to load payments", error);
    return (
      <AccountShell current="/account/payments" title="Payments">
        <LoadError title="We couldn't load your payments." />
      </AccountShell>
    );
  }

  return (
    <AccountShell
      current="/account/payments"
      title="Payments"
      subtitle="Your wallet, and the methods Quoin can take."
    >
      <div className="space-y-4">
        <Card padding="lg" className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
            <Wallet className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="nums text-title font-semibold text-ink">{formatPrice(walletPaise ?? 0)}</p>
            <p className="mt-0.5 text-caption text-muted">Wallet balance</p>
          </div>
        </Card>

        {payments.length === 0 ? (
          <EmptyState icon={<CreditCard className="size-6" />} title="No payments yet">
            Payments you make for orders appear here with their transaction ID.
          </EmptyState>
        ) : (
          <>
            <Card padding="none" className="hidden overflow-hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead className="border-b border-line-soft bg-sunk text-micro uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Transaction ID</th>
                      <th className="px-4 py-3 font-medium">Order ID</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Method</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment, i) => (
                      <tr key={`${payment.orderReference}-${i}`} className="border-b border-line-hair last:border-0">
                        <td className="px-4 py-3 text-muted">
                          {paymentTransactionId(payment.provider, payment.providerPaymentId)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/account/orders/${payment.orderReference}`}
                            className="nums font-medium text-ink hover:text-accent"
                          >
                            {payment.orderReference}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted">{DATE_FORMAT.format(payment.createdAt)}</td>
                        <td className="nums px-4 py-3 text-right font-medium text-ink">
                          {formatPrice(payment.amountPaise)}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {paymentMethodLabel(payment.provider, payment.method)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONE[payment.status]} size="sm">
                            {paymentStatusLabel(payment.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <ul className="space-y-3 lg:hidden">
              {payments.map((payment, i) => (
                <li key={`${payment.orderReference}-${i}-m`}>
                  <Card className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/account/orders/${payment.orderReference}`}
                        className="nums text-body-sm font-medium text-ink hover:text-accent"
                      >
                        {payment.orderReference}
                      </Link>
                      <Badge tone={STATUS_TONE[payment.status]} size="sm">
                        {paymentStatusLabel(payment.status)}
                      </Badge>
                    </div>
                    <p className="nums text-body font-semibold text-ink">{formatPrice(payment.amountPaise)}</p>
                    <p className="text-caption text-muted">
                      {DATE_FORMAT.format(payment.createdAt)} ·{" "}
                      {paymentMethodLabel(payment.provider, payment.method)}
                    </p>
                    <p className="truncate text-caption text-faint">
                      {paymentTransactionId(payment.provider, payment.providerPaymentId)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}

        <Card className="flex items-start gap-3">
          <Shield className="mt-0.5 size-4.5 shrink-0 text-accent" />
          <p className="text-caption leading-relaxed text-muted">
            Quoin will never ask for a card number, a CVV or a UPI PIN over
            the phone. Anyone who does is not from Quoin.
          </p>
        </Card>
      </div>
    </AccountShell>
  );
}
