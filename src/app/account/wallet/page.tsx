import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { Card } from "@/components/ui/Card";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { getSession } from "@/lib/auth/session";
import {
  WALLET_KIND_LABEL,
  getWalletBalance,
  listWalletEntries,
} from "@/lib/data/wallet";
import { formatPrice } from "@/lib/types/catalog";

export const metadata: Metadata = { title: "Your wallet — Quoin" };

/** Reads a live balance; never a cached one. */
export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * The wallet, and every movement behind it.
 *
 * The balance is the sum of the rows underneath it, and the rows are
 * all shown — that is the point of a ledger and the reason this page
 * is a list rather than a number. A customer who cannot see where a
 * figure came from has to take it on trust, and money a business holds
 * for somebody else is exactly where trust should not be required.
 *
 * What it does not offer yet, and says so rather than implying
 * otherwise: adding money, and spending it at checkout. Both are
 * builds of their own — see the note at the top of
 * `src/lib/data/wallet.ts`.
 */
export default async function WalletPage() {
  const session = await getSession();
  if (!session) {
    return (
      <AccountShell
        current="/account/wallet"
        title="Your wallet"
        subtitle="Credit held on your account, and where it came from."
      >
        <SignInPrompt
          what="Your wallet belongs to your account, so signing in is how it finds you."
          next="/account/wallet"
        />
      </AccountShell>
    );
  }

  const [balancePaise, entries] = await Promise.all([
    getWalletBalance(session.userId),
    listWalletEntries(session.userId),
  ]);

  return (
    <AccountShell
      current="/account/wallet"
      title="Your wallet"
      subtitle="Credit held on your account, and where it came from."
    >
      <Card>
        <p className="text-caption text-muted">Balance</p>
        <p className="nums mt-1 text-display-sm font-semibold text-ink">
          {formatPrice(balancePaise)}
        </p>
        {balancePaise === 0 && (
          <p className="mt-2 max-w-prose text-body-sm text-muted">
            Nothing in it yet. A refund or a credit from Quoin lands here, and
            the history below will show each one.
          </p>
        )}
      </Card>

      {entries.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-body font-semibold text-ink">History</h2>
          <ul className="mt-3 divide-y divide-line-hair">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-body-sm text-ink">
                    {entry.note || WALLET_KIND_LABEL[entry.kind]}
                  </p>
                  <p className="text-caption text-muted">
                    {WALLET_KIND_LABEL[entry.kind]} · {WHEN.format(entry.createdAt)}
                  </p>
                </div>
                {/* Signed, and the sign is the data rather than a
                    decoration: the ledger stores a spend as a negative
                    number, so this prints what is stored. */}
                <span
                  className={
                    "nums shrink-0 text-body-sm font-semibold " +
                    (entry.amountPaise < 0 ? "text-ink" : "text-success")
                  }
                >
                  {entry.amountPaise < 0 ? "−" : "+"}
                  {formatPrice(Math.abs(entry.amountPaise))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AccountShell>
  );
}
