"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { SignOut } from "@/components/icons";

/**
 * Signs out from the account overview, the same way `SettingsPanel` does
 * from Settings — two entry points to one `POST /api/v1/auth/logout`,
 * which is the only thing that actually ends the session. There is no
 * second sign-out mechanism to keep in sync here.
 */
export function LogOutButton() {
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      const res = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      toast.toast("Signed out");
      router.push("/");
      /* The session is a cookie and every page that reads it renders on
         the server — without this the header would still show the
         signed-in tree until the next hard navigation. */
      router.refresh();
    } catch {
      toast.error("We could not sign you out. Try again.");
      setSigningOut(false);
    }
  }

  return (
    <Button variant="danger" block loading={signingOut} onClick={signOut}>
      <SignOut className="size-4" />
      Log out
    </Button>
  );
}
