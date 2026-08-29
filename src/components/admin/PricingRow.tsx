"use client";

import { useState } from "react";
import { ProductImage } from "@/components/storefront/ProductImage";
import type { UnpricedProduct } from "@/lib/data/catalog";

type State =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; price: number }
  | { kind: "error"; message: string };

/**
 * One product waiting for a price.
 *
 * Saves per row rather than as one large form. There are hundreds of
 * these and a merchandiser works through them in a sitting — losing an
 * hour of typing to a failed submit at the end would be the worst
 * outcome, so each row commits on its own and says so.
 */
export function PricingRow({ product }: { product: UnpricedProduct }) {
  const [mrp, setMrp] = useState("");
  const [price, setPrice] = useState("");
  const [proPrice, setProPrice] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function save() {
    const mrpValue = Number(mrp);
    /* Blank sell price means "sell at MRP" — the common case, and it
       saves typing the same number into two boxes. */
    const priceValue = Number(price === "" ? mrp : price);

    if (!mrpValue || !priceValue) {
      setState({ kind: "error", message: "Enter an MRP" });
      return;
    }

    setState({ kind: "saving" });
    try {
      const res = await fetch(
        `/api/v1/admin/products/${encodeURIComponent(product.sku)}/price`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mrp: mrpValue,
            price: priceValue,
            proPrice: proPrice === "" ? null : Number(proPrice),
          }),
        },
      );
      const body = await res.json();

      if (!res.ok) {
        const fields = body?.error?.fields as Record<string, string> | undefined;
        setState({
          kind: "error",
          message: fields
            ? Object.values(fields)[0]
            : (body?.error?.message ?? "Could not save"),
        });
        return;
      }
      setState({ kind: "saved", price: priceValue });
    } catch {
      setState({ kind: "error", message: "Network error — not saved" });
    }
  }

  const done = state.kind === "saved";

  return (
    <li
      className={`flex items-start gap-4 rounded-card border p-3 transition-colors ${
        done ? "border-success/40 bg-success/5" : "border-line-soft bg-surface"
      }`}
    >
      <div className="size-20 shrink-0 overflow-hidden rounded-tile bg-raised">
        <ProductImage
          photo={product.photo}
          swatchKey={product.image}
          label={product.title}
          className="size-full"
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-ink">{product.title}</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {product.brand ? `${product.brand} · ` : ""}
          {product.sku}
          {product.category ? ` · ${product.category}` : ""}
        </p>

        {done ? (
          <p className="mt-2 text-xs text-success">
            Priced at ₹{state.price.toLocaleString("en-IN")} — live in the storefront.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Field label="MRP" value={mrp} onChange={setMrp} />
            <Field label="Sell" value={price} onChange={setPrice} placeholder="= MRP" />
            <Field label="Pro" value={proPrice} onChange={setProPrice} placeholder="none" />

            <button
              onClick={save}
              disabled={state.kind === "saving"}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-bright disabled:opacity-50"
            >
              {state.kind === "saving" ? "Saving…" : "Save"}
            </button>

            {state.kind === "error" && (
              <span className="text-xs text-danger">{state.message}</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted">
      {label}
      <span className="flex items-center gap-0.5 rounded-lg border border-line bg-bg px-2 py-1 focus-within:border-accent">
        <span className="text-ink">₹</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder={placeholder}
          inputMode="decimal"
          className="w-20 bg-transparent text-xs text-ink outline-none placeholder:text-faint"
        />
      </span>
    </label>
  );
}
