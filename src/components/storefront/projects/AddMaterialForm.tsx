"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { useProjects, type MaterialStatus } from "@/lib/store/projects";

/**
 * Adding a material by hand.
 *
 * The one add flow this project had none of: everything on the Materials
 * tab that is not a line from a linked order got there through this form,
 * `POST /api/v1/projects/{id}/materials` and the store's existing
 * `addMaterial` — nothing new on the wire, just the screen to reach it
 * from.
 */
export function AddMaterialForm({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded?: () => void;
}) {
  const { addMaterial } = useProjects();
  const [title, setTitle] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [rupees, setRupees] = useState("");
  const [status, setStatus] = useState<MaterialStatus>("planned");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;

    setBusy(true);
    setError(null);
    try {
      await addMaterial(projectId, {
        title: name,
        qty: Number(qty) || 1,
        unit: unit.trim() || undefined,
        /* Rupees in the form, paise in the store — the same boundary the
           rest of the app keeps. */
        unitPricePaise: rupees ? Math.round(Number(rupees) * 100) : undefined,
        status,
      });
      setTitle("");
      setQty("1");
      setUnit("");
      setRupees("");
      setStatus("planned");
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Material" htmlFor="material-title" className="sm:col-span-2">
        <Input
          id="material-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Cement, 43 grade"
          disabled={busy}
          maxLength={160}
        />
      </Field>
      <Field label="Quantity" htmlFor="material-qty">
        <Input
          id="material-qty"
          type="number"
          inputMode="decimal"
          min={0}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          disabled={busy}
          className="nums"
        />
      </Field>
      <Field label="Unit" htmlFor="material-unit">
        <Input
          id="material-unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="bags"
          disabled={busy}
          maxLength={40}
        />
      </Field>
      <Field label="Price each" htmlFor="material-price" hint="Leave blank if you don't know it yet.">
        <Input
          id="material-price"
          type="number"
          inputMode="decimal"
          min={0}
          value={rupees}
          onChange={(e) => setRupees(e.target.value)}
          leading={<span className="text-body">₹</span>}
          disabled={busy}
          className="nums"
        />
      </Field>
      <Field label="Status" htmlFor="material-status">
        <Select
          id="material-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as MaterialStatus)}
          disabled={busy}
        >
          <option value="planned">Planned</option>
          <option value="ordered">Ordered</option>
          <option value="delivered">Delivered</option>
        </Select>
      </Field>

      {error && (
        <div className="sm:col-span-2">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" loading={busy} disabled={busy || !title.trim()}>
          Add material
        </Button>
      </div>
    </form>
  );
}
