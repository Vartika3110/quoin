"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };

/**
 * The one write on the "start tracking" screen — everything above it in
 * `/admin/inventory/track/page.tsx` is server-rendered search.
 *
 * Redirects to the new item's own page on success rather than rendering
 * a "done" state here: an item that was just created and has no history
 * yet is a page this component would have to fake, and the real detail
 * page already exists to show it truthfully.
 */
export function StockTrackForm({
  variantId,
  stores,
}: {
  variantId: string;
  stores: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/v1/admin/inventory/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, storeId, openingQty: Number(qty) }),
      });
      const payload = await res.json();

      if (!res.ok) {
        const fields = payload?.error?.fields as Record<string, string> | undefined;
        setStatus({
          kind: "error",
          message: fields ? Object.values(fields)[0] : (payload?.error?.message ?? "Could not save"),
        });
        return;
      }

      router.push(`/admin/inventory/${payload.data.itemId}`);
    } catch {
      setStatus({ kind: "error", message: "Network error — not saved" });
    }
  }

  if (stores.length === 0) {
    return <p className="text-body-sm text-danger">No active store to track against.</p>;
  }

  const saving = status.kind === "saving";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Store" htmlFor="track-store">
        <Select id="track-store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Opening quantity" htmlFor="track-qty" hint="Counted right now, written as a receipt">
        <Input
          id="track-qty"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
          className="w-32"
        />
      </Field>
      <Button disabled={saving || !qty || Number(qty) <= 0} loading={saving} onClick={submit}>
        Start tracking
      </Button>
      {status.kind === "error" && (
        <p className="w-full text-body-sm text-danger">{status.message}</p>
      )}
    </div>
  );
}
