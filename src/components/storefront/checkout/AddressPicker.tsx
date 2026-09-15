"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/components/ui/cn";
import { Check, Pencil, Pin, Plus, Trash } from "@/components/icons";
import { maskPhone } from "@/lib/auth/phone";
import { addressLabelText, formatAddressLines } from "@/lib/addresses/format";

/**
 * Choosing where it goes — and, in `manage` mode, looking after the book
 * of addresses that choice is made from.
 *
 * One component for both because they show the same card for the same
 * reason `AddressBook` wraps this rather than reimplementing it: the
 * coordinate requirement, the label vocabulary and the recipient fields
 * only need to be right in one place. `mode` defaults to `"select"` so
 * every existing call site — checkout above all — is unaffected by
 * account management being added here.
 */

export interface Address {
  id: string;
  label: "HOME" | "WORK" | "SITE" | "OTHER";
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  recipientName?: string | null;
  recipientPhone?: string | null;
}

const LABELS: Address["label"][] = ["HOME", "WORK", "SITE", "OTHER"];

/** +919876543210 → +91 98765 43210 — unmasked, for the account owner's own address book. */
function formatPhonePlain(e164: string): string {
  const local = e164.replace("+91", "");
  if (local.length !== 10) return e164;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

export function AddressPicker({
  selectedId,
  onSelect,
  mode = "select",
}: {
  selectedId: string | null;
  onSelect: (address: Address) => void;
  /** `"manage"` is the account address book: no selection, edit/delete/default instead. */
  mode?: "select" | "manage";
}) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  async function load() {
    const res = await fetch("/api/v1/addresses");
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { data: { addresses: Address[] } };
    return body.data.addresses;
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const list = await load();
        if (ignore) return;
        setAddresses(list);
        /* Pre-select the default so a returning customer can move straight
           on rather than re-choosing what they already chose. Meaningless
           in `manage` mode, which has no selection at all. */
        if (mode === "select") {
          const fallback = list.find((a) => a.isDefault) ?? list[0];
          if (!selectedId && fallback) onSelect(fallback);
        }
      } catch {
        if (!ignore) setError("We could not load your saved addresses.");
      }
    })();
    return () => {
      ignore = true;
    };
    /* Runs once: re-running on `selectedId` would re-select the default
       every time the customer picked a different address. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    try {
      setAddresses(await load());
    } catch {
      setError("We could not load your saved addresses.");
    }
  }

  async function setDefault(id: string) {
    setBusyId(id);
    setRowError(null);
    try {
      const res = await fetch(`/api/v1/addresses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "That did not save.");
      await refresh();
    } catch (e) {
      setRowError({ id, message: e instanceof Error ? e.message : "That did not save." });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete(id: string) {
    setBusyId(id);
    setRowError(null);
    try {
      const res = await fetch(`/api/v1/addresses/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "That did not delete.");
      setDeletingId(null);
      await refresh();
    } catch (e) {
      setRowError({ id, message: e instanceof Error ? e.message : "That did not delete." });
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <InlineError>{error}</InlineError>;
  if (!addresses) return <ListSkeleton rows={2} />;

  if (addresses.length === 0 && !adding) {
    return (
      <EmptyState
        compact
        icon={<Pin className="size-6" />}
        title={mode === "manage" ? "No saved addresses yet." : "No addresses yet"}
        action={{ label: "Add an address", onClick: () => setAdding(true) }}
      >
        Quoin needs the exact spot to decide which store can reach you and
        how quickly.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {addresses.map((address) => {
          if (mode === "manage" && editingId === address.id) {
            return (
              <li key={address.id}>
                <AddressForm
                  initial={address}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await refresh();
                  }}
                />
              </li>
            );
          }

          const [line, cityLine] = formatAddressLines(address);
          const contact = [
            address.recipientName,
            address.recipientPhone
              ? mode === "manage"
                ? formatPhonePlain(address.recipientPhone)
                : maskPhone(address.recipientPhone)
              : null,
          ]
            .filter(Boolean)
            .join(" · ");

          if (mode === "select") {
            const on = address.id === selectedId;
            return (
              <li key={address.id}>
                <button
                  type="button"
                  onClick={() => onSelect(address)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors",
                    on
                      ? "border-accent bg-accent-wash"
                      : "border-line-soft bg-surface hover:border-line-strong",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                      on
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line-strong text-transparent",
                    )}
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-semibold text-ink">
                        {addressLabelText(address.label)}
                      </span>
                      {address.isDefault && (
                        <span className="rounded-sm bg-raised px-1.5 py-0.5 text-micro text-muted">
                          Default
                        </span>
                      )}
                    </span>
                    {contact && (
                      <span className="mt-0.5 block text-caption text-ink">{contact}</span>
                    )}
                    <span className="mt-1 block text-caption leading-relaxed text-muted">
                      {line}
                      <br />
                      {cityLine}
                    </span>
                  </span>
                </button>
              </li>
            );
          }

          return (
            <li key={address.id}>
              <div className="rounded-card border border-line-soft bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-semibold text-ink">
                    {addressLabelText(address.label)}
                  </span>
                  {address.isDefault && (
                    <span className="rounded-sm bg-raised px-1.5 py-0.5 text-micro text-muted">
                      Default
                    </span>
                  )}
                </div>
                {contact && (
                  <p className="mt-0.5 text-caption text-ink">{contact}</p>
                )}
                <p className="mt-1 text-caption leading-relaxed text-muted">
                  {line}
                  <br />
                  {cityLine}
                </p>

                {rowError?.id === address.id && (
                  <div className="mt-2">
                    <InlineError>{rowError.message}</InlineError>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === address.id}
                    onClick={() => setEditingId(address.id)}
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  {!address.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busyId === address.id}
                      disabled={busyId === address.id}
                      onClick={() => setDefault(address.id)}
                    >
                      Set default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === address.id}
                    onClick={() => setDeletingId(address.id)}
                  >
                    <Trash className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <AddressForm
          onCancel={() => setAdding(false)}
          onSaved={(saved) => {
            setAddresses((current) => [saved, ...(current ?? [])]);
            if (mode === "select") onSelect(saved);
            setAdding(false);
          }}
        />
      ) : (
        <Button variant="outline" block onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add another address
        </Button>
      )}

      {mode === "manage" && (
        <Modal
          open={deletingId != null}
          onClose={() => (busyId === deletingId ? null : setDeletingId(null))}
          title="Delete this address?"
          description="This can't be undone."
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setDeletingId(null)}
                disabled={busyId === deletingId}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={busyId === deletingId}
                onClick={() => deletingId && confirmDelete(deletingId)}
              >
                <Trash className="size-4" />
                Delete
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}

/**
 * The address form — new or, in `manage` mode, an existing one being
 * edited in place.
 *
 * Short on purpose. Every field here is one the API requires or one a
 * driver genuinely needs; "address line 3" and "alternate phone" are the
 * fields that make a checkout feel like paperwork. The recipient fields
 * are the one exception, and they are optional: most deliveries go to the
 * account holder, and a field nobody has to fill in is a field that
 * cannot be gotten wrong.
 */
function AddressForm({
  initial,
  onSaved,
  onCancel,
}: {
  /** Present only when editing an existing address. */
  initial?: Address;
  onSaved: (address: Address) => void | Promise<void>;
  onCancel: () => void;
}) {
  const editing = Boolean(initial);
  const [label, setLabel] = useState<Address["label"]>(initial?.label ?? "SITE");
  const [line1, setLine1] = useState(initial?.line1 ?? "");
  const [landmark, setLandmark] = useState(initial?.landmark ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [pincode, setPincode] = useState(initial?.pincode ?? "");
  const [recipientName, setRecipientName] = useState(initial?.recipientName ?? "");
  const [recipientPhone, setRecipientPhone] = useState(initial?.recipientPhone ?? "");
  /* Prefilled from the existing row when editing — it was already pinned
     once, and re-demanding a location the address already has would be
     asking a customer to prove something the database already knows. */
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function locate() {
    if (!("geolocation" in navigator)) {
      setError("This browser cannot share a location. Try a phone.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setError(
          "We could not read your location. Allow location access and try again.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!coords) {
      setError("Pin the location first — it decides which store serves you.");
      return;
    }

    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(
        editing ? `/api/v1/addresses/${initial!.id}` : "/api/v1/addresses",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label,
            line1,
            landmark: landmark || undefined,
            city,
            state,
            pincode,
            lat: coords.lat,
            lng: coords.lng,
            recipientName,
            recipientPhone,
          }),
        },
      );
      const body = (await res.json()) as {
        data?: { address: Address };
        error?: { message: string; fields?: Record<string, string> };
      };
      if (!res.ok || !body.data) {
        if (body.error?.fields) setFieldErrors(body.error.fields);
        throw new Error(body.error?.message ?? "That did not save.");
      }
      await onSaved(body.data.address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="space-y-4 rounded-card border border-line-soft bg-surface p-4"
    >
      <Field label="What is this address" htmlFor="addr-label">
        <Select
          id="addr-label"
          value={label}
          onChange={(e) => setLabel(e.target.value as Address["label"])}
        >
          {LABELS.map((l) => (
            <option key={l} value={l}>
              {addressLabelText(l)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Flat, building or plot" htmlFor="addr-line1" required>
        <Input
          id="addr-line1"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
          autoComplete="address-line1"
          required
        />
      </Field>

      <Field label="Landmark" htmlFor="addr-landmark" hint="Optional, but drivers use it.">
        <Input
          id="addr-landmark"
          value={landmark}
          onChange={(e) => setLandmark(e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" htmlFor="addr-city" required>
          <Input
            id="addr-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
            required
          />
        </Field>
        <Field label="State" htmlFor="addr-state" required>
          <Input
            id="addr-state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            autoComplete="address-level1"
            required
          />
        </Field>
        <Field label="PIN code" htmlFor="addr-pin" required>
          <Input
            id="addr-pin"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="postal-code"
            className="nums"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Recipient name"
          htmlFor="addr-recipient-name"
          hint="Optional. Who is actually there to receive it."
          error={fieldErrors.recipientName}
        >
          <Input
            id="addr-recipient-name"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            autoComplete="name"
            maxLength={80}
          />
        </Field>
        <Field
          label="Recipient phone"
          htmlFor="addr-recipient-phone"
          hint="Optional. Used only for this address."
          error={fieldErrors.recipientPhone}
        >
          <Input
            id="addr-recipient-phone"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-line-soft bg-raised p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-medium text-ink">Pin the location</p>
            <p className="mt-0.5 text-micro leading-snug text-muted">
              {coords
                ? "Location captured. It is used only to work out serviceability."
                : "Serviceability is decided on coordinates, not the PIN code."}
            </p>
          </div>
          <Button
            type="button"
            variant={coords ? "subtle" : "outline"}
            size="sm"
            loading={locating}
            onClick={locate}
          >
            {coords ? (
              <>
                <Check className="size-4" />
                Pinned
              </>
            ) : (
              <>
                <Pin className="size-4" />
                Use my location
              </>
            )}
          </Button>
        </div>
      </div>

      {error && <InlineError>{error}</InlineError>}

      <div className="flex gap-2">
        <Button type="submit" loading={busy} className="flex-1">
          {editing ? "Save changes" : "Save address"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
