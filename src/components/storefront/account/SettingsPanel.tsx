"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { SignOut } from "@/components/icons";
import { ThemeToggle } from "@/components/storefront/ThemeToggle";

/**
 * Account settings.
 *
 * Short, because there is genuinely little to set: the account is a
 * verified phone number and a display name. A settings screen padded out
 * with toggles that control nothing is worse than a short one.
 *
 * The name is not editable here yet — `/api/v1/me` is read-only — so the
 * field says so rather than accepting keystrokes and dropping them.
 */
export function SettingsPanel({
  name,
  maskedPhone,
}: {
  name: string | null;
  maskedPhone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setSigningOut(true);
    setError(null);
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
      setError("We could not sign you out. Try again.");
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <h2 className="text-title-sm font-semibold text-ink">Your details</h2>

        <div className="mt-4 space-y-4">
          <Field
            label="Name"
            htmlFor="settings-name"
            hint="Editing a name needs the profile endpoint, which is not built yet."
          >
            <Input
              id="settings-name"
              defaultValue={name ?? ""}
              placeholder="Not set"
              disabled
            />
          </Field>

          <Field
            label="Mobile number"
            htmlFor="settings-phone"
            hint="Masked on purpose — a shoulder over the counter reads a whole number as easily as its owner does."
          >
            <Input
              id="settings-phone"
              defaultValue={maskedPhone}
              className="nums"
              disabled
            />
          </Field>
        </div>
      </Card>

      <Card padding="lg" className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-title-sm font-semibold text-ink">Appearance</h2>
          <p className="mt-1 text-caption text-muted">
            Light or dark. With neither chosen, Quoin follows your device.
          </p>
        </div>
        <ThemeToggle className="size-11" />
      </Card>

      <Card padding="lg">
        <h2 className="text-title-sm font-semibold text-ink">Session</h2>
        <p className="mt-1 text-caption leading-relaxed text-muted">
          Signing out clears the session on this device. Your cart, wishlist
          and projects stay in this browser.
        </p>

        {error && (
          <div className="mt-3">
            <InlineError>{error}</InlineError>
          </div>
        )}

        <Button
          variant="danger"
          className="mt-4"
          loading={signingOut}
          onClick={signOut}
        >
          <SignOut className="size-4" />
          Sign out
        </Button>
      </Card>
    </div>
  );
}
