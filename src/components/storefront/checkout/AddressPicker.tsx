"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { Check, Pin, Plus } from "@/components/icons";

/**
 * Choosing where it goes.
 *
 * Coordinates are not optional here, because they are not optional in the
 * API: serviceability is decided on lat/lng, so an address saved without
 * them is an address Quoin cannot promise to deliver to. There is no
 * geocoding service wired up, so the only honest source is the device
 * itself — hence "Use my current location" being a requirement of the form
 * rather than a convenience on it. The button says why.
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
  isDefault: boolean;
}

const LABELS: Address["label"][] = ["HOME", "WORK", "SITE", "OTHER"];

const LABEL_TEXT: Record<Address["label"], string> = {
  HOME: "Home",
  WORK: "Work",
  SITE: "Site",
  OTHER: "Other",
};

export function AddressPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (address: Address) => void;
}) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/addresses");
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data: { addresses: Address[] } };
        if (ignore) return;
        setAddresses(body.data.addresses);
        /* Pre-select the default so a returning customer can move straight
           on rather than re-choosing what they already chose. */
        const fallback =
          body.data.addresses.find((a) => a.isDefault) ?? body.data.addresses[0];
        if (!selectedId && fallback) onSelect(fallback);
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

  if (error) return <InlineError>{error}</InlineError>;
  if (!addresses) return <ListSkeleton rows={2} />;

  if (addresses.length === 0 && !adding) {
    return (
      <EmptyState
        compact
        icon={<Pin className="size-6" />}
        title="No addresses yet"
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
                      {LABEL_TEXT[address.label]}
                    </span>
                    {address.isDefault && (
                      <span className="rounded-sm bg-raised px-1.5 py-0.5 text-micro text-muted">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-caption leading-relaxed text-muted">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    {address.landmark ? ` (${address.landmark})` : ""}
                    <br />
                    {address.city}, {address.state}{" "}
                    <span className="nums">{address.pincode}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <AddressForm
          onCancel={() => setAdding(false)}
          onSaved={(address) => {
            setAddresses((current) => [address, ...(current ?? [])]);
            onSelect(address);
            setAdding(false);
          }}
        />
      ) : (
        <Button variant="outline" block onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add another address
        </Button>
      )}
    </div>
  );
}

/**
 * The new-address form.
 *
 * Short on purpose. Every field here is one the API requires or one a
 * driver genuinely needs; "address line 3" and "alternate phone" are the
 * fields that make a checkout feel like paperwork.
 */
function AddressForm({
  onSaved,
  onCancel,
}: {
  onSaved: (address: Address) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState<Address["label"]>("SITE");
  const [line1, setLine1] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const res = await fetch("/api/v1/addresses", {
        method: "POST",
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
        }),
      });
      const body = (await res.json()) as {
        data?: { address: Address };
        error?: { message: string };
      };
      if (!res.ok || !body.data) {
        throw new Error(body.error?.message ?? "That did not save.");
      }
      onSaved(body.data.address);
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
              {LABEL_TEXT[l]}
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
          Save address
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
