"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  gstinProblem,
  isIfscShaped,
  isPanShaped,
  panFromGstin,
} from "@/lib/vendors/identifiers";

/**
 * Adding and editing a vendor.
 *
 * **The checks run twice, on purpose.** The same arithmetic from
 * `src/lib/vendors/identifiers.ts` runs here as you type and again in
 * `createVendor` before anything is written. Here it is a courtesy —
 * you learn the GSTIN is wrong while you are still looking at the
 * document — and there it is the rule, because a form is not the only
 * thing that can write a vendor.
 *
 * Nothing is blocked client-side. The submit stays live even with a
 * complaint showing, because the server's answer is the one that counts
 * and a form that refuses to submit is a form you cannot get a real
 * error out of.
 *
 * Field errors come back keyed by field name and land under the input
 * that caused them — see the `details` shape in the route.
 */

export interface VendorValues {
  legalName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  upiVpa: string;
  paymentTermsDays: number;
  notes: string;
}

export const EMPTY_VENDOR: VendorValues = {
  legalName: "",
  tradeName: "",
  gstin: "",
  pan: "",
  phone: "",
  email: "",
  addressLine: "",
  city: "",
  state: "",
  pincode: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  upiVpa: "",
  paymentTermsDays: 7,
  notes: "",
};

const GSTIN_HINT: Record<string, string> = {
  length: "Fifteen characters.",
  shape: "Two digits, a PAN, then 1Z and a check character.",
  state: "The first two digits are not a state code.",
  checksum: "The check character does not match the rest — there is a typo in it.",
};

export function VendorForm({
  vendorId,
  initial,
}: {
  /** Absent creates; present updates. */
  vendorId?: string;
  initial?: VendorValues;
}) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<VendorValues>(initial ?? EMPTY_VENDOR);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof VendorValues>(key: K, value: VendorValues[K]) {
    setV((current) => ({ ...current, [key]: value }));
  }

  /* Live, free, and no call to anybody — see the module note. */
  const gstinLive = v.gstin.trim() ? gstinProblem(v.gstin) : null;
  const panInGstin = panFromGstin(v.gstin);
  const panLive =
    v.pan.trim() && !isPanShaped(v.pan)
      ? "Five letters, four digits, a letter."
      : v.pan.trim() && panInGstin && panInGstin !== v.pan.trim().toUpperCase()
        ? `The GSTIN says ${panInGstin}.`
        : null;
  const ifscLive =
    v.bankIfsc.trim() && !isIfscShaped(v.bankIfsc)
      ? "Four letters, a zero, then six — the fifth is a zero, not an O."
      : null;

  async function submit() {
    setSaving(true);
    setErrors({});
    try {
      const url = vendorId ? `/api/v1/admin/vendors/${vendorId}` : "/api/v1/admin/vendors";
      const res = await fetch(url, {
        method: vendorId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          vendorId ? { action: "details", ...v } : v,
        ),
      });
      const body = await res.json();

      if (!res.ok) {
        /* `fields` carries the per-field messages; the top-level message
           is the fallback for anything that is not about one input. */
        setErrors(body?.error?.fields ?? {});
        toast.error(body?.error?.message ?? "Could not save this vendor");
        return;
      }

      toast.success(vendorId ? "Vendor saved" : "Vendor added");
      router.push(`/admin/vendors/${body.data.id}`);
      router.refresh();
    } catch {
      toast.error("Network error — nothing was saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-body font-semibold text-ink">Who they are</h2>

        <Field
          label="Legal name"
          htmlFor="legalName"
          hint="As printed on the PAN — this is what a bank check compares against."
          error={errors.legalName}
          required
        >
          <Input
            id="legalName"
            value={v.legalName}
            onChange={(e) => set("legalName", e.target.value)}
            maxLength={160}
          />
        </Field>

        <Field label="Trading name" htmlFor="tradeName" hint="What staff call them, if different.">
          <Input
            id="tradeName"
            value={v.tradeName}
            onChange={(e) => set("tradeName", e.target.value)}
            maxLength={160}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="GSTIN"
            htmlFor="gstin"
            hint="Optional — a supplier below the threshold has none."
            error={errors.gstin ?? (gstinLive ? GSTIN_HINT[gstinLive] : undefined)}
          >
            <Input
              id="gstin"
              value={v.gstin}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              maxLength={20}
              aria-invalid={gstinLive ? true : undefined}
              className="nums"
            />
          </Field>

          <Field
            label="PAN"
            htmlFor="pan"
            hint={panInGstin ? `Taken from the GSTIN if left blank.` : "Optional."}
            error={errors.pan ?? panLive ?? undefined}
          >
            <Input
              id="pan"
              value={v.pan}
              onChange={(e) => set("pan", e.target.value.toUpperCase())}
              maxLength={12}
              aria-invalid={panLive ? true : undefined}
              className="nums"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="phone" error={errors.phone} required>
            <Input
              id="phone"
              value={v.phone}
              onChange={(e) => set("phone", e.target.value)}
              maxLength={20}
              inputMode="tel"
              className="nums"
            />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              value={v.email}
              onChange={(e) => set("email", e.target.value)}
              maxLength={160}
              inputMode="email"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-body font-semibold text-ink">Where they are</h2>
        <Field label="Address" htmlFor="addressLine">
          <Input
            id="addressLine"
            value={v.addressLine}
            onChange={(e) => set("addressLine", e.target.value)}
            maxLength={200}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="city">
            <Input id="city" value={v.city} onChange={(e) => set("city", e.target.value)} maxLength={80} />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" value={v.state} onChange={(e) => set("state", e.target.value)} maxLength={80} />
          </Field>
          <Field label="PIN" htmlFor="pincode">
            <Input
              id="pincode"
              value={v.pincode}
              onChange={(e) => set("pincode", e.target.value)}
              maxLength={10}
              inputMode="numeric"
              className="nums"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-body font-semibold text-ink">How they get paid</h2>
        <p className="max-w-prose text-caption text-muted">
          An account and IFSC together, or a UPI ID — either is enough. Nothing
          here is verified against the bank yet: that needs a penny-drop check,
          which costs a few rupees a time and waits on the payouts account.
        </p>

        <Field
          label="Account name"
          htmlFor="bankAccountName"
          hint="As the bank holds it, which is often not the legal name."
        >
          <Input
            id="bankAccountName"
            value={v.bankAccountName}
            onChange={(e) => set("bankAccountName", e.target.value)}
            maxLength={160}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account number" htmlFor="bankAccountNumber" error={errors.bankAccountNumber}>
            <Input
              id="bankAccountNumber"
              value={v.bankAccountNumber}
              onChange={(e) => set("bankAccountNumber", e.target.value)}
              maxLength={24}
              inputMode="numeric"
              className="nums"
            />
          </Field>
          <Field
            label="IFSC"
            htmlFor="bankIfsc"
            error={errors.bankIfsc ?? ifscLive ?? undefined}
          >
            <Input
              id="bankIfsc"
              value={v.bankIfsc}
              onChange={(e) => set("bankIfsc", e.target.value.toUpperCase())}
              maxLength={16}
              aria-invalid={ifscLive ? true : undefined}
              className="nums"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="UPI ID" htmlFor="upiVpa" error={errors.upiVpa}>
            <Input
              id="upiVpa"
              value={v.upiVpa}
              onChange={(e) => set("upiVpa", e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field
            label="Payment terms"
            htmlFor="paymentTermsDays"
            hint="Days between settlements. Seven is the weekly cycle."
            error={errors.paymentTermsDays}
          >
            <Input
              id="paymentTermsDays"
              value={String(v.paymentTermsDays)}
              onChange={(e) => set("paymentTermsDays", Number(e.target.value) || 0)}
              maxLength={3}
              inputMode="numeric"
              className="nums"
            />
          </Field>
        </div>
      </section>

      <Field label="Notes" htmlFor="notes" hint="Anything the next person needs — who to ring, what they are slow on.">
        <Textarea
          id="notes"
          value={v.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          maxLength={1000}
        />
      </Field>

      <Button onClick={submit} loading={saving} disabled={saving}>
        {vendorId ? "Save vendor" : "Add vendor"}
      </Button>
    </div>
  );
}
