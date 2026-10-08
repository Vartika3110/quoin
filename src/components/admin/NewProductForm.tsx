"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { GST_SLABS } from "@/lib/admin/catalogue-input";
import { FULFILMENT_LABEL, UNIT_LABEL } from "@/lib/admin/catalogue-view";

/**
 * Adding one product by hand.
 *
 * The importer covers a manufacturer's export; this covers the single
 * line a supplier has just started stocking. It asks for a price in the
 * same breath as the name, because a product with no variant is invisible
 * in the shop — saving a hidden row and saying nothing would read as the
 * save having failed.
 *
 * The fields it does *not* ask for are as deliberate as the ones it does:
 * no image (that is `/admin/images`, which also records whether the
 * picture was generated), no badges, no stock, and no `INSTANT`
 * fulfilment. See `src/lib/admin/catalogue-input.ts`.
 */

type Option = { id: string; name: string };

/** The three fulfilments a hand-added product may have — never `INSTANT`. */
const FULFILMENTS = ["SCHEDULED", "BOOKABLE", "MADE_TO_ORDER"] as const;

const UNITS = [
  "PER_PIECE",
  "PER_SQFT",
  "PER_RUNNING_FT",
  "PER_VISIT",
  "PER_BAG",
  "PER_LITRE",
  "PER_KG",
] as const;

export function NewProductForm({
  brands,
  categories,
}: {
  brands: Option[];
  categories: Option[];
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [gst, setGst] = useState("18");
  const [fulfilment, setFulfilment] = useState<(typeof FULFILMENTS)[number]>("SCHEDULED");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>("PER_PIECE");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [mrp, setMrp] = useState("");
  const [price, setPrice] = useState("");
  const [proPrice, setProPrice] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [stepQty, setStepQty] = useState("1");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Keyed by the field name the route put in `error.fields`, so a message
     lands under the box that caused it rather than at the bottom. */
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});

    /* Blank sell price means "sell at MRP", as it does everywhere else a
       price is entered in these tools. */
    const sellPrice = Number(price === "" ? mrp : price);

    try {
      const res = await fetch("/api/v1/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sku,
          description,
          brandId: brandId || null,
          categoryId: categoryId || null,
          gstRatePct: Number(gst),
          fulfilment,
          pricingUnit: unit,
          leadTimeDays: leadTimeDays === "" ? null : Number(leadTimeDays),
          mrp: Number(mrp),
          price: sellPrice,
          proPrice: proPrice === "" ? null : Number(proPrice),
          minQty: Number(minQty) || 1,
          stepQty: Number(stepQty) || 1,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setFields((payload?.error?.fields as Record<string, string>) ?? {});
        setError(payload?.error?.message ?? "Could not save");
        setSaving(false);
        return;
      }

      /* Back to the register, searched for what was just created, so the
         new row is the one thing on screen and can be checked at a
         glance. `refresh` first because the list is a server component
         and would otherwise be served from the client router cache
         without the new product in it. */
      router.refresh();
      router.push(`/admin/products?q=${encodeURIComponent(payload.data.sku)}`);
    } catch {
      setError("Network error — nothing was saved");
      setSaving(false);
    }
  }

  const priced = Boolean(Number(mrp));

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Product name"
            htmlFor="np-name"
            required
            error={fields.name}
            hint="As it should read in the shop."
          >
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Häfele Soft-Close Hinge 110°"
              required
            />
          </Field>

          <Field
            label="Product code"
            htmlFor="np-sku"
            required
            error={fields.sku}
            hint="The manufacturer's code. Upper-cased, and must be unique."
          >
            <Input
              id="np-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="HAF-329.18.600"
              className="nums"
              required
            />
          </Field>

          <Field label="Brand" htmlFor="np-brand" error={fields.brandId}>
            <Select id="np-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Category"
            htmlFor="np-category"
            error={fields.categoryId}
            hint="Decides which tile and which category page it appears under."
          >
            <Select
              id="np-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description" htmlFor="np-description" error={fields.description}>
          <Textarea
            id="np-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What it is and what it fits. Plain description — no claims the supplier has not made."
          />
        </Field>
      </section>

      <section className="space-y-4 border-t border-line-soft pt-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="MRP"
            htmlFor="np-mrp"
            required
            error={fields.mrp}
            hint="In rupees, tax included."
          >
            <Input
              id="np-mrp"
              value={mrp}
              onChange={(e) => setMrp(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              leading={<span className="text-ink">₹</span>}
              className="nums"
              required
            />
          </Field>

          <Field
            label="Sell price"
            htmlFor="np-price"
            error={fields.price}
            hint="Leave blank to sell at MRP."
          >
            <Input
              id="np-price"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              leading={<span className="text-ink">₹</span>}
              className="nums"
            />
          </Field>

          <Field
            label="Pro price"
            htmlFor="np-pro"
            error={fields.proPrice}
            hint="Trade rate. Blank means Pro pays the sell price."
          >
            <Input
              id="np-pro"
              value={proPrice}
              onChange={(e) => setProPrice(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              leading={<span className="text-ink">₹</span>}
              className="nums"
            />
          </Field>
        </div>

        {/* Prices in this catalogue already contain GST — the slab is what
            the invoice extracts, never what it adds on top. Said on the
            form because the opposite assumption would misprice every line
            it was applied to. */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="GST slab"
            htmlFor="np-gst"
            error={fields.gstRatePct}
            hint="Contained in the prices above, not added to them."
          >
            <Select id="np-gst" value={gst} onChange={(e) => setGst(e.target.value)}>
              {GST_SLABS.map((slab) => (
                <option key={slab} value={slab}>
                  {slab}%
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Priced by" htmlFor="np-unit" error={fields.pricingUnit}>
            <Select
              id="np-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as (typeof UNITS)[number])}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Minimum"
              htmlFor="np-min"
              error={fields.minQty}
              hint="Smallest sellable quantity."
            >
              <Input
                id="np-min"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="nums"
              />
            </Field>
            <Field label="Step" htmlFor="np-step" error={fields.stepQty} hint="Sold in multiples of.">
              <Input
                id="np-step"
                value={stepQty}
                onChange={(e) => setStepQty(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="nums"
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-line-soft pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="How it reaches the customer"
            htmlFor="np-fulfilment"
            error={fields.fulfilment}
            hint="Instant is not offered here — it promises a dark store is holding the item, which needs counted stock first."
          >
            <Select
              id="np-fulfilment"
              value={fulfilment}
              onChange={(e) => setFulfilment(e.target.value as (typeof FULFILMENTS)[number])}
            >
              {FULFILMENTS.map((f) => (
                <option key={f} value={f}>
                  {FULFILMENT_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>

          {fulfilment !== "BOOKABLE" && (
            <Field
              label="Lead time"
              htmlFor="np-lead"
              error={fields.leadTimeDays}
              hint="Days, if you quote one. Shown on the product page."
            >
              <Input
                id="np-lead"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="e.g. 3"
                className="nums"
              />
            </Field>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-6">
        <Button type="submit" loading={saving} disabled={saving || !name || !sku || !priced}>
          Add to the catalogue
        </Button>
        <Button href="/admin/products" variant="ghost">
          Cancel
        </Button>
        <p className="text-micro text-muted">
          It goes live on the storefront as soon as it is saved. Retire it from the
          register if that is not what you want yet.
        </p>
      </div>
    </form>
  );
}
