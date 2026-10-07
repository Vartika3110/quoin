"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import type { AdminVendorRow } from "@/lib/data/admin-vendors";

/**
 * The vendor directory: who Quoin's new-order WhatsApps go to, and the
 * form that adds another one.
 *
 * This replaces opening a terminal. The WhatsApp number used to be
 * settable only from `npm run vendors:whatsapp`, which was a reasonable
 * answer for one column on rows that change once a year — and stopped
 * being one the moment a failed notification on an order page said "no
 * WhatsApp number on file" and the fix was somewhere else entirely.
 *
 * Two different kinds of edit, kept visibly apart because they carry
 * different stakes:
 *
 * - **Contact details** are safe. Filling in a number starts vendor
 *   messages working; clearing it stops them. Nothing else moves.
 * - **Active** is the consequential one, and the UI says so rather than
 *   relying on the operator to know. An active store becomes the nearest
 *   store for every address inside its radius, so one with no stock turns
 *   those customers' checkouts into "no longer in stock at your delivery
 *   address". The server refuses that case; this component turns the
 *   refusal into a question with the consequence written out instead of
 *   showing it as an error.
 *
 * Every write answers with the whole refreshed list, so this re-renders
 * from the server's own projection rather than splicing a row whose shape
 * it has guessed. `router.refresh()` as well, because the order pages'
 * vendor cards read the same rows.
 */

type Fields = Record<string, string>;

export function VendorDirectory({
  vendors: initial,
  unclaimedAreas,
  whatsappConfigured,
}: {
  vendors: AdminVendorRow[];
  unclaimedAreas: { id: string; name: string }[];
  /** False when this deployment has no WhatsApp credentials — worth
      saying once here, because otherwise a correctly-filled number looks
      like it should be working and nothing arrives. */
  whatsappConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [vendors, setVendors] = useState(initial);
  const [adding, setAdding] = useState(false);

  function applyResult(body: { data: { vendors: AdminVendorRow[] } }) {
    setVendors(body.data.vendors);
    router.refresh();
  }

  const missingNumbers = vendors.filter((v) => v.isActive && !v.whatsappPhone).length;

  return (
    <div className="space-y-6">
      {!whatsappConfigured && (
        <p className="rounded-lg bg-warning-wash px-4 py-3 text-body-sm text-warning">
          WhatsApp is not configured on this deployment, so no vendor messages are being sent
          whatever is filled in below. Orders are unaffected — every notification is recorded as
          failed and can be retried from the order page once the credentials are set.
        </p>
      )}

      {whatsappConfigured && missingNumbers > 0 && (
        <p className="rounded-lg bg-warning-wash px-4 py-3 text-body-sm text-warning">
          {missingNumbers === 1
            ? "One active vendor has no WhatsApp number, so it is not being told about its orders."
            : `${missingNumbers} active vendors have no WhatsApp number, so they are not being told about their orders.`}
        </p>
      )}

      <div className="space-y-4">
        {vendors.map((vendor) => (
          <VendorCard key={vendor.id} vendor={vendor} onUpdated={applyResult} />
        ))}
      </div>

      {adding ? (
        <AddVendorForm
          unclaimedAreas={unclaimedAreas}
          onCancel={() => setAdding(false)}
          onCreated={(body) => {
            applyResult(body);
            setAdding(false);
            toast.success("Vendor added — switched off until you stock it");
          }}
        />
      ) : (
        <Button onClick={() => setAdding(true)} variant="outline">
          Add a vendor
        </Button>
      )}
    </div>
  );
}

/** ---- One vendor ---------------------------------------------------------- */

function VendorCard({
  vendor,
  onUpdated,
}: {
  vendor: AdminVendorRow;
  onUpdated: (body: { data: { vendors: AdminVendorRow[] } }) => void;
}) {
  const toast = useToast();
  const [phone, setPhone] = useState(vendor.whatsappPhone ?? "");
  const [contactName, setContactName] = useState(vendor.contactName ?? "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [fields, setFields] = useState<Fields>({});

  const dirty =
    phone.trim() !== (vendor.whatsappPhone ?? "") ||
    contactName.trim() !== (vendor.contactName ?? "");

  async function saveContact() {
    setSaving(true);
    setFields({});
    try {
      const res = await fetch(`/api/v1/admin/vendors/${encodeURIComponent(vendor.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "contact",
          whatsappPhone: phone.trim() || null,
          contactName: contactName.trim() || null,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setFields(body?.error?.fields ?? {});
        toast.error(body?.error?.message ?? "Could not save these details");
        return;
      }

      onUpdated(body);
      toast.success(
        phone.trim()
          ? `${vendor.name} will get new-order messages`
          : `${vendor.name} will no longer get new-order messages`,
      );
    } catch {
      toast.error("Network error — nothing was saved");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(isActive: boolean, acknowledgeEmptyStock = false) {
    setToggling(true);
    try {
      const res = await fetch(`/api/v1/admin/vendors/${encodeURIComponent(vendor.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "active", isActive, acknowledgeEmptyStock }),
      });
      const body = await res.json();

      if (!res.ok) {
        /* The server refuses to activate a store holding no stock unless
           it has been acknowledged. Its message *is* the question —
           it names the consequence — so it is asked rather than shown as
           a failure, and a yes repeats the request with the flag. */
        if (res.status === 409 && isActive && !acknowledgeEmptyStock) {
          setToggling(false);
          if (window.confirm(`${body?.error?.message}\n\nActivate it anyway?`)) {
            await setActive(true, true);
          }
          return;
        }
        toast.error(body?.error?.message ?? "Could not change this vendor");
        return;
      }

      onUpdated(body);
      toast.success(isActive ? `${vendor.name} is live` : `${vendor.name} is switched off`);
    } catch {
      toast.error("Network error — nothing was changed");
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {vendor.name}
            {vendor.isDefault && (
              <Badge tone="info" size="sm" className="ml-2">
                Default warehouse
              </Badge>
            )}
          </p>
          <p className="nums mt-0.5 text-caption text-muted">
            {vendor.code}
            {vendor.serviceAreaName ? ` · ${vendor.serviceAreaName}` : ""}
            {` · ${vendor.serviceRadiusKm} km radius · ${vendor.baseEtaMinutes} min to pick`}
          </p>
          <p className="nums text-caption text-muted">
            {vendor.inventoryItemCount === 0
              ? "No tracked stock"
              : `${vendor.inventoryItemCount} tracked ${vendor.inventoryItemCount === 1 ? "item" : "items"}`}
            {vendor.outstandingFulfilments > 0 &&
              ` · ${vendor.outstandingFulfilments} order${vendor.outstandingFulfilments === 1 ? "" : "s"} awaiting dispatch`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={vendor.isActive ? "success" : "neutral"} size="sm">
            {vendor.isActive ? "Live" : "Switched off"}
          </Badge>
          <Button
            onClick={() => setActive(!vendor.isActive)}
            loading={toggling}
            disabled={toggling}
            variant="outline"
            size="sm"
          >
            {vendor.isActive ? "Switch off" : "Switch on"}
          </Button>
        </div>
      </div>

      {/* Outstanding legs survive a deactivation — the fulfilment snapshots
          the store — so this is information, not a reason to refuse. */}
      {vendor.isActive && vendor.inventoryItemCount === 0 && (
        <p className="mt-3 rounded-lg bg-warning-wash px-3 py-2 text-caption text-warning">
          This vendor is live but holds no tracked stock. It is the nearest store for every
          address inside its radius, and those baskets will fail to reserve. Stock it, or switch
          it off.
        </p>
      )}

      <div className="mt-4 grid gap-3 border-t border-line-hair pt-4 sm:grid-cols-2">
        <Field
          label="WhatsApp number"
          htmlFor={`phone-${vendor.id}`}
          error={fields.whatsappPhone}
          hint="Where this vendor's new-order messages go. Leave empty to stop sending them."
        >
          <Input
            id={`phone-${vendor.id}`}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
        </Field>

        <Field
          label="Contact name"
          htmlFor={`contact-${vendor.id}`}
          error={fields.contactName}
          hint="Who to ask for. Falls back to the store name."
        >
          <Input
            id={`contact-${vendor.id}`}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder={vendor.name}
          />
        </Field>
      </div>

      {dirty && (
        <Button onClick={saveContact} loading={saving} disabled={saving} size="sm" className="mt-3">
          Save contact details
        </Button>
      )}
    </Card>
  );
}

/** ---- Adding one ---------------------------------------------------------- */

function AddVendorForm({
  unclaimedAreas,
  onCancel,
  onCreated,
}: {
  unclaimedAreas: { id: string; name: string }[];
  onCancel: () => void;
  onCreated: (body: { data: { vendors: AdminVendorRow[] } }) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Fields>({});
  const [form, setForm] = useState({
    code: "",
    name: "",
    contactName: "",
    whatsappPhone: "",
    lat: "",
    lng: "",
    serviceRadiusKm: "5",
    baseEtaMinutes: "18",
    serviceAreaId: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setSaving(true);
    setFields({});
    try {
      const res = await fetch("/api/v1/admin/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          contactName: form.contactName || undefined,
          whatsappPhone: form.whatsappPhone || undefined,
          /* `Number("")` is 0, which would be a valid-looking coordinate
             in the Gulf of Guinea. NaN fails `validateVendor`'s finite
             check and comes back as a field message instead. */
          lat: form.lat.trim() === "" ? Number.NaN : Number(form.lat),
          lng: form.lng.trim() === "" ? Number.NaN : Number(form.lng),
          serviceRadiusKm: Number(form.serviceRadiusKm),
          baseEtaMinutes: Number(form.baseEtaMinutes),
          serviceAreaId: form.serviceAreaId || undefined,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setFields(body?.error?.fields ?? {});
        toast.error(body?.error?.message ?? "Could not add this vendor");
        return;
      }

      onCreated(body);
    } catch {
      toast.error("Network error — the vendor was not added");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone="sunk">
      <CardHeader
        title="Add a vendor"
        subtitle="A vendor is a store — the shop that holds the stock and sends the goods."
      />

      <p className="mb-4 rounded-lg bg-info-wash px-3 py-2 text-caption text-info">
        New vendors are added <strong>switched off</strong>. An active store becomes the nearest
        store for every address inside its radius, and a new one has no stock yet — so going live
        immediately would make those customers&rsquo; baskets fail. Stock it from Inventory, then
        switch it on here.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Store code" htmlFor="v-code" error={fields.code} hint="Like DEL-JNK." required>
          <Input
            id="v-code"
            value={form.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            placeholder="DEL-JNK"
            autoCapitalize="characters"
          />
        </Field>

        <Field label="Store name" htmlFor="v-name" error={fields.name} required>
          <Input
            id="v-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Quoin Janakpuri"
          />
        </Field>

        <Field
          label="WhatsApp number"
          htmlFor="v-phone"
          error={fields.whatsappPhone}
          hint="Optional now; without it this vendor is not told about its orders."
        >
          <Input
            id="v-phone"
            type="tel"
            inputMode="tel"
            value={form.whatsappPhone}
            onChange={(e) => set("whatsappPhone", e.target.value)}
            placeholder="+91 98765 43210"
          />
        </Field>

        <Field label="Contact name" htmlFor="v-contact" error={fields.contactName}>
          <Input
            id="v-contact"
            value={form.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            placeholder="Who to ask for"
          />
        </Field>

        <Field
          label="Latitude"
          htmlFor="v-lat"
          error={fields.lat}
          hint="Delhi is about 28.6. Copy it from Google Maps."
          required
        >
          <Input
            id="v-lat"
            inputMode="decimal"
            value={form.lat}
            onChange={(e) => set("lat", e.target.value)}
            placeholder="28.6219"
          />
        </Field>

        <Field
          label="Longitude"
          htmlFor="v-lng"
          error={fields.lng}
          hint="Delhi is about 77.1. Latitude first in Maps, longitude second."
          required
        >
          <Input
            id="v-lng"
            inputMode="decimal"
            value={form.lng}
            onChange={(e) => set("lng", e.target.value)}
            placeholder="77.0878"
          />
        </Field>

        <Field
          label="Delivery radius (km)"
          htmlFor="v-radius"
          error={fields.serviceRadiusKm}
          hint="Straight-line, so keep it conservative against real roads."
          required
        >
          <Input
            id="v-radius"
            inputMode="decimal"
            value={form.serviceRadiusKm}
            onChange={(e) => set("serviceRadiusKm", e.target.value)}
          />
        </Field>

        <Field
          label="Pick-and-pack time (minutes)"
          htmlFor="v-eta"
          error={fields.baseEtaMinutes}
          hint="The floor for the delivery promise; travel time is added on top."
          required
        >
          <Input
            id="v-eta"
            inputMode="numeric"
            value={form.baseEtaMinutes}
            onChange={(e) => set("baseEtaMinutes", e.target.value)}
          />
        </Field>

        {/* Only the areas no store has claimed — `Store.serviceAreaId` is
            unique, so offering a taken one would be offering a rejection. */}
        {unclaimedAreas.length > 0 && (
          <Field
            label="Service area"
            htmlFor="v-area"
            error={fields.serviceAreaId}
            hint="Optional. Gives customers a name to pick this store by."
            className="sm:col-span-2"
          >
            <Select
              id="v-area"
              value={form.serviceAreaId}
              onChange={(e) => set("serviceAreaId", e.target.value)}
            >
              <option value="">No area</option>
              {unclaimedAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={submit} loading={saving} disabled={saving}>
          Add vendor
        </Button>
        <Button onClick={onCancel} variant="ghost" disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
