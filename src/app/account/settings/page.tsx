import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { SettingsPanel } from "@/components/storefront/account/SettingsPanel";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { maskPhone } from "@/lib/auth/phone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings — Quoin" };

export default async function SettingsPage() {
  const session = await getSession();
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { name: true, phone: true },
      })
    : null;

  return (
    <AccountShell current="/account/settings" title="Settings">
      {!user ? (
        <SignInPrompt what="Signing in lets you manage your details and this device's session." />
      ) : (
        <SettingsPanel name={user.name} maskedPhone={maskPhone(user.phone)} />
      )}
    </AccountShell>
  );
}
