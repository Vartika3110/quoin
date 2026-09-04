import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { AddressBook } from "@/components/storefront/account/AddressBook";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Addresses — Quoin" };

export default async function AddressesPage() {
  const signedIn = Boolean(await getSession());

  return (
    <AccountShell
      current="/account/addresses"
      title="Addresses"
      subtitle="Where Quoin delivers. Serviceability is decided on the exact spot, not the PIN code."
    >
      {signedIn ? (
        <AddressBook />
      ) : (
        <SignInPrompt what="Signing in saves your addresses so a delivery is two taps rather than a form." />
      )}
    </AccountShell>
  );
}
