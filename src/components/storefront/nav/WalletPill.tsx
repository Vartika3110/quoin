"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wallet } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";

/**
 * The wallet balance, in the header.
 *
 * The design reference draws it as a chip reading "₹0" between the
 * theme toggle and the account button, and that is where it sits.
 *
 * **Fetched, not server-rendered**, and the reason is caching rather
 * than preference: the header is part of a shell that every page
 * shares, and a balance baked into it would be served from whatever
 * the last reader saw. A client fetch is one request against a
 * `force-dynamic` route that reads the caller's own session.
 *
 * **Renders nothing until it has a number.** A chip that says ₹0 for a
 * moment and then changes to ₹2,400 is worse than a chip that appears
 * once — the first thing a customer reads about their own money should
 * not be a value that was never true. It also renders nothing when the
 * balance is zero and nothing has ever been in it: an empty wallet is
 * not a feature to advertise in the header of every page, and the
 * account menu carries the link regardless.
 */
export function WalletPill({ className }: { className?: string }) {
  const [balancePaise, setBalance] = useState<number | null>(null);

  useEffect(() => {
    /* Aborted on unmount: the header remounts on a theme or session
       change, and a resolved fetch calling `setState` on a component
       that has gone is a warning in development and a leak in a long
       session. */
    const abort = new AbortController();

    fetch("/api/v1/wallet", { signal: abort.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const paise = body?.data?.balancePaise;
        if (typeof paise === "number") setBalance(paise);
      })
      .catch(() => {
        /* A wallet that cannot be read is a chip that does not appear.
           There is nothing useful to tell somebody in a header. */
      });

    return () => abort.abort();
  }, []);

  if (balancePaise === null || balancePaise === 0) return null;

  return (
    <Link
      href="/account/wallet"
      aria-label={`Wallet balance ${formatPrice(balancePaise)}`}
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-soft bg-surface px-2.5 py-1.5 text-caption font-semibold text-ink transition-colors hover:border-accent-edge hover:text-accent " +
        (className ?? "")
      }
    >
      <Wallet className="size-4 text-accent" />
      <span className="nums">{formatPrice(balancePaise)}</span>
    </Link>
  );
}
