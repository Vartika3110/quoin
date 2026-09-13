"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { Phone, SignOut } from "@/components/icons";
import { ThemeToggle } from "@/components/storefront/ThemeToggle";

/**
 * Account settings.
 *
 * Short, because there is genuinely little to set: the account is a
 * verified phone number (or, lacking one, an unverified delivery contact),
 * a display name and an appearance toggle.
 *
 * The name is not editable here yet — `/api/v1/me` is read-only for it —
 * so that field says so rather than accepting keystrokes and dropping
 * them. The phone field is not that: `PATCH /api/v1/me` edits
 * `User.deliveryPhone`, never `User.phone` — see the doc comments on both
 * columns in `prisma/schema.prisma`, and `deliveryPhoneFor` in
 * `src/lib/auth/phone.ts` for how the two are reconciled everywhere else.
 */
export function SettingsPanel({
  name,
  email,
  maskedPhone,
  maskedDeliveryPhone,
}: {
  name: string | null;
  email: string | null;
  /** The verified, OTP identity number. Null for a Google account that has
      never verified one — in that case `maskedDeliveryPhone` is what this
      screen lets the customer manage instead. */
  maskedPhone: string | null;
  /** The unverified shipping contact, masked. Only ever shown or editable
      when `maskedPhone` is null — a verified number already answers "where
      do deliveries go", so there is nothing here for it to add. */
  maskedDeliveryPhone: string | null;
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
        <h2 className="font-display text-title-sm font-semibold text-ink">Your details</h2>

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

          {maskedPhone ? (
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
          ) : (
            <DeliveryPhoneField maskedDeliveryPhone={maskedDeliveryPhone} />
          )}

          {email && (
            <Field label="Email" htmlFor="settings-email" hint="From your Google account.">
              <Input id="settings-email" defaultValue={email} disabled />
            </Field>
          )}
        </div>
      </Card>

      <Card padding="lg" className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-title-sm font-semibold text-ink">Appearance</h2>
          <p className="mt-1 text-caption text-muted">
            Light or dark. With neither chosen, Quoin follows your device.
          </p>
        </div>
        <ThemeToggle className="size-11" />
      </Card>

      <Card padding="lg">
        <h2 className="font-display text-title-sm font-semibold text-ink">Session</h2>
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

/**
 * The delivery-phone field for an account with no verified number.
 *
 * Three states: nothing saved (a live input, ready to type into), a saved
 * number (masked and read-only, with Change/Remove), and mid-edit (Change
 * pressed — an empty input again, with Save/Cancel). `editing` starts true
 * exactly when there is nothing saved, because in that state there is no
 * read-only view to show.
 */
function DeliveryPhoneField({
  maskedDeliveryPhone,
}: {
  maskedDeliveryPhone: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(!maskedDeliveryPhone);
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function patch(body: { deliveryPhone: string | null }) {
    const res = await fetch("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json()) as {
      data?: { deliveryPhone: string | null };
      error?: { message: string; fields?: Record<string, string> };
    };
    if (!res.ok) {
      throw new Error(
        parsed.error?.fields?.deliveryPhone ??
          parsed.error?.message ??
          "Something went wrong. Please try again.",
      );
    }
  }

  async function save() {
    setFieldError(null);
    setSaving(true);
    try {
      await patch({ deliveryPhone: value });
      toast.toast("Delivery phone saved");
      setEditing(false);
      setValue("");
      router.refresh();
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setFieldError(null);
    setSaving(true);
    try {
      await patch({ deliveryPhone: null });
      toast.toast("Delivery phone removed");
      /* Nothing saved any more — back to the live-input state, matching
         what a fresh account with no number sees. */
      setEditing(true);
      router.refresh();
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing && maskedDeliveryPhone) {
    return (
      <Field label="Delivery phone" htmlFor="settings-delivery-phone">
        <div className="flex items-center gap-2">
          <Input
            id="settings-delivery-phone"
            defaultValue={maskedDeliveryPhone}
            className="nums"
            disabled
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setEditing(true)}
          >
            Change
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            loading={saving}
            disabled={saving}
            onClick={remove}
          >
            Remove
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <Field
      label="Delivery phone"
      htmlFor="settings-delivery-phone"
      hint="Indian numbers only, with or without +91. Used by our delivery team to reach you — not for signing in."
      error={fieldError}
    >
      <div className="flex items-center gap-2">
        <Input
          id="settings-delivery-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          leading={<Phone className="size-4" />}
          value={value}
          disabled={saving}
          aria-invalid={fieldError ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (fieldError) setFieldError(null);
          }}
        />
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          loading={saving}
          disabled={saving}
          onClick={save}
        >
          Save
        </Button>
        {maskedDeliveryPhone && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setValue("");
              setFieldError(null);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </Field>
  );
}
