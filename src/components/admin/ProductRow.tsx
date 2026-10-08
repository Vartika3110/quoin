"use client";

import { useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Trash } from "@/components/icons";
import {
  FULFILMENT_LABEL,
  UNIT_LABEL,
  type CatalogueProduct,
  type CatalogueStatus,
  type CatalogueVariant,
} from "@/lib/admin/catalogue-view";
import { formatPrice } from "@/lib/types/catalog";

/**
 * One catalogue row, and everything that can be done to it.
 *
 * A client component because this is the part of the panel that writes.
 * Each row commits on its own rather than the page being one large form,
 * for the reason `PricingRow` does: there are hundreds of these, someone
 * works through them in a sitting, and losing a half-hour of typing to a
 * failed submit at the end would be the worst possible outcome.
 *
 * Saved rows stay where they are and say what happened instead of
 * disappearing. A row that re-sorted or vanished the moment it was saved
 * would take the next row with it — the one the cursor was about to
 * reach — which is how a list like this becomes impossible to work down.
 */

type Write =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/** Paise into the rupees a merchandiser types, with no trailing `.00`. */
function toRupeeInput(paise: number | null): string {
  if (paise == null) return "";
  return String(paise % 100 === 0 ? paise / 100 : (paise / 100).toFixed(2));
}

async function send(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      /* Field errors are more specific than the envelope's message —
         "Sell price cannot exceed the MRP" rather than "Some fields need
         attention" — so they win when both are present. */
      const fields = payload?.error?.fields as Record<string, string> | undefined;
      return {
        ok: false,
        message: fields
          ? Object.values(fields)[0]
          : (payload?.error?.message ?? "Could not save"),
      };
    }
    return { ok: true, data: (payload?.data ?? {}) as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Network error — nothing was saved" };
  }
}

const STATUS_BADGE: Record<
  CatalogueStatus,
  { tone: "success" | "warning" | "neutral"; label: string }
> = {
  live: { tone: "success", label: "Live" },
  unpriced: { tone: "warning", label: "No price" },
  hidden: { tone: "warning", label: "Hidden" },
  retired: { tone: "neutral", label: "Retired" },
};

export function ProductRow({ product }: { product: CatalogueProduct }) {
  /* Local mirrors of the three things this row can change, so that a save
     is reflected without a reload. The server stays the authority — each
     one is set from the response, never optimistically. */
  const [variants, setVariants] = useState<CatalogueVariant[]>(product.variants);
  const [status, setStatus] = useState<CatalogueStatus>(product.status);
  const [gone, setGone] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [row, setRow] = useState<Write>({ kind: "idle" });

  if (gone) {
    return (
      <li className="rounded-card border border-dashed border-line-soft bg-raised px-4 py-3 text-body-sm text-muted">
        <span className="text-ink">{product.name}</span> was deleted. Its past
        orders are unaffected — they keep their own copy of what was sold.
      </li>
    );
  }

  const badge = STATUS_BADGE[status];
  const busy = row.kind === "busy";

  async function setRetired(retire: boolean) {
    setRow({ kind: "busy" });
    const res = await send(`/api/v1/admin/products/${encodeURIComponent(product.sku)}`, "PATCH", {
      isActive: !retire,
    });

    if (!res.ok) {
      setRow({ kind: "error", message: res.message });
      return;
    }

    setStatus(
      retire ? "retired" : res.data.sellable ? "live" : variants.length === 0 ? "unpriced" : "hidden",
    );
    setRow({
      kind: "done",
      message: retire
        ? "Retired — off the storefront. Its URL still works if you restore it."
        : res.data.sellable
          ? "Back on the storefront."
          : "Restored, but still hidden: it needs a price before it can sell.",
    });
  }

  async function destroy() {
    setRow({ kind: "busy" });
    const res = await send(
      `/api/v1/admin/products/${encodeURIComponent(product.sku)}`,
      "DELETE",
    );
    setConfirming(false);

    if (!res.ok) {
      setRow({ kind: "error", message: res.message });
      return;
    }
    setGone(true);
  }

  return (
    <li
      className={`rounded-card border bg-surface p-3 transition-colors ${
        status === "retired" ? "border-line-soft opacity-70" : "border-line-soft"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-tile bg-raised">
          <ProductImage
            photo={product.photo}
            swatchKey={product.swatch}
            label={product.name}
            sizes="64px"
            className="size-full"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Links to the storefront page, which is the fastest way to
                check that an edit landed the way it was meant to. Retired
                products have no page to link to. */}
            {status === "retired" ? (
              <span className="text-body-sm font-medium text-ink">{product.name}</span>
            ) : (
              <Link
                href={`/p/${product.slug}`}
                target="_blank"
                className="text-body-sm font-medium text-ink hover:text-accent"
              >
                {product.name}
              </Link>
            )}
            <Badge tone={badge.tone} size="sm">
              {badge.label}
            </Badge>
            {product.stockTracked && (
              <Badge tone="info" size="sm">
                Stock tracked
              </Badge>
            )}
          </div>

          <p className="mt-0.5 text-micro text-muted">
            {product.brand ? `${product.brand} · ` : ""}
            <span className="nums">{product.sku}</span>
            {product.category ? ` · ${product.category}` : ""}
            {` · ${UNIT_LABEL[product.pricingUnit]} · ${FULFILMENT_LABEL[product.fulfilment]} · GST ${product.gstRatePct}%`}
          </p>

          <div className="mt-2 space-y-2">
            {variants.length === 0 ? (
              <FirstPrice
                sku={product.sku}
                onPriced={(variant) => {
                  setVariants([variant]);
                  /* A first price is what makes a product visible at all —
                     but only if the product itself is still active. */
                  setStatus(status === "retired" ? "retired" : "live");
                }}
              />
            ) : (
              variants.map((variant) => (
                <PriceEditor
                  key={variant.id}
                  sku={product.sku}
                  variant={variant}
                  showLabel={variants.length > 1 || !variant.isActive}
                  onSaved={(next) =>
                    setVariants((all) => all.map((v) => (v.id === next.id ? next : v)))
                  }
                />
              ))
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {status === "retired" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRetired(false)}>
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRetired(true)}>
              Retire
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="text-danger hover:bg-danger-wash hover:text-danger"
          >
            <Trash className="size-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {row.kind === "done" && (
        <p className="mt-2 text-micro text-success">{row.message}</p>
      )}
      {row.kind === "error" && (
        <p className="mt-2 text-micro text-danger">{row.message}</p>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${product.name}?`}
        description="This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={destroy}>
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-body-sm text-muted">
          <p>
            The product, its {variants.length === 1 ? "price" : "prices"} and any
            wishlist entries or back-in-stock alerts pointing at it are removed.
          </p>
          {product.orderLines > 0 && (
            <p>
              It has been sold on{" "}
              <span className="font-medium text-ink">
                {product.orderLines} order {product.orderLines === 1 ? "line" : "lines"}
              </span>
              . Those are unaffected — an order keeps its own copy of what was
              bought and what it cost — but nobody will be able to open the
              product from them afterwards.
            </p>
          )}
          <p>
            If you only want it off the shop,{" "}
            <span className="font-medium text-ink">Retire</span> does that and can
            be undone.
          </p>
        </div>
      </Modal>
    </li>
  );
}

/** ---- the price editors ---------------------------------------------- */

function PriceEditor({
  sku,
  variant,
  showLabel,
  onSaved,
}: {
  sku: string;
  variant: CatalogueVariant;
  /** Only worth the space when a product has more than one variant. */
  showLabel: boolean;
  onSaved: (next: CatalogueVariant) => void;
}) {
  const [mrp, setMrp] = useState(toRupeeInput(variant.mrpPaise));
  const [price, setPrice] = useState(toRupeeInput(variant.pricePaise));
  const [proPrice, setProPrice] = useState(toRupeeInput(variant.proPricePaise));
  const [state, setState] = useState<Write>({ kind: "idle" });

  /* Nothing to submit until something changed. Also what keeps the Save
     button from inviting a write that would only rewrite the same three
     numbers and overwrite a concurrent edit with them. */
  const dirty =
    mrp !== toRupeeInput(variant.mrpPaise) ||
    price !== toRupeeInput(variant.pricePaise) ||
    proPrice !== toRupeeInput(variant.proPricePaise);

  async function save() {
    const mrpValue = Number(mrp);
    /* A blank sell price means "sell at MRP", as it does on the pricing
       queue — it saves typing the same number into two boxes. */
    const priceValue = Number(price === "" ? mrp : price);

    if (!mrpValue || !priceValue) {
      setState({ kind: "error", message: "Enter an MRP" });
      return;
    }

    setState({ kind: "busy" });
    const res = await send(
      `/api/v1/admin/products/${encodeURIComponent(sku)}/price`,
      "PATCH",
      {
        variantId: variant.id,
        mrp: mrpValue,
        price: priceValue,
        proPrice: proPrice === "" ? null : Number(proPrice),
      },
    );

    if (!res.ok) {
      setState({ kind: "error", message: res.message });
      return;
    }

    const saved: CatalogueVariant = {
      ...variant,
      mrpPaise: res.data.mrpPaise as number,
      pricePaise: res.data.pricePaise as number,
      proPricePaise: (res.data.proPricePaise as number | null) ?? null,
    };
    onSaved(saved);
    setMrp(toRupeeInput(saved.mrpPaise));
    setPrice(toRupeeInput(saved.pricePaise));
    setProPrice(toRupeeInput(saved.proPricePaise));
    setState({
      kind: "done",
      message: `Now ${formatPrice(saved.pricePaise)} on the storefront.`,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showLabel && (
        <span className="text-micro text-muted">
          {variant.label} · <span className="nums">{variant.sku}</span>
          {!variant.isActive && (
            /* Priced, but switched off, so the storefront will not offer
               it. Said on the variant rather than only on the product,
               because on a multi-variant row it is one of several. */
            <span className="ml-1 text-warning">· switched off</span>
          )}
        </span>
      )}
      <Money label="MRP" value={mrp} onChange={setMrp} />
      <Money label="Sell" value={price} onChange={setPrice} placeholder="= MRP" />
      <Money label="Pro" value={proPrice} onChange={setProPrice} placeholder="none" />

      <Button
        size="sm"
        variant={dirty ? "primary" : "outline"}
        disabled={!dirty || state.kind === "busy"}
        loading={state.kind === "busy"}
        onClick={save}
      >
        Save
      </Button>

      {state.kind === "done" && !dirty && (
        <span className="text-micro text-success">{state.message}</span>
      )}
      {state.kind === "error" && (
        <span className="text-micro text-danger">{state.message}</span>
      )}
      {variant.stockedItems > 0 && (
        <span className="text-micro text-faint">
          {variant.stockedItems} stock {variant.stockedItems === 1 ? "record" : "records"}
        </span>
      )}
    </div>
  );
}

/**
 * The same three boxes, for a product that has never had a price.
 *
 * `POST` rather than `PATCH`: creating the first variant is what makes a
 * product sellable, and the route keeps the two operations apart so that
 * repricing cannot happen by accident from here.
 */
function FirstPrice({
  sku,
  onPriced,
}: {
  sku: string;
  onPriced: (variant: CatalogueVariant) => void;
}) {
  const [mrp, setMrp] = useState("");
  const [price, setPrice] = useState("");
  const [proPrice, setProPrice] = useState("");
  const [state, setState] = useState<Write>({ kind: "idle" });

  async function save() {
    const mrpValue = Number(mrp);
    const priceValue = Number(price === "" ? mrp : price);

    if (!mrpValue || !priceValue) {
      setState({ kind: "error", message: "Enter an MRP" });
      return;
    }

    setState({ kind: "busy" });
    const res = await send(
      `/api/v1/admin/products/${encodeURIComponent(sku)}/price`,
      "POST",
      {
        mrp: mrpValue,
        price: priceValue,
        proPrice: proPrice === "" ? null : Number(proPrice),
      },
    );

    if (!res.ok) {
      setState({ kind: "error", message: res.message });
      return;
    }

    onPriced({
      id: res.data.variantId as string,
      sku: res.data.variantSku as string,
      label: "Standard",
      mrpPaise: res.data.mrpPaise as number,
      pricePaise: res.data.pricePaise as number,
      proPricePaise: (res.data.proPricePaise as number | null) ?? null,
      minQty: 1,
      stepQty: 1,
      isActive: true,
      stockedItems: 0,
    });
    setState({ kind: "idle" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Money label="MRP" value={mrp} onChange={setMrp} />
      <Money label="Sell" value={price} onChange={setPrice} placeholder="= MRP" />
      <Money label="Pro" value={proPrice} onChange={setProPrice} placeholder="none" />
      <Button size="sm" loading={state.kind === "busy"} disabled={state.kind === "busy"} onClick={save}>
        Set price
      </Button>
      {state.kind === "error" && (
        <span className="text-micro text-danger">{state.message}</span>
      )}
    </div>
  );
}

/**
 * A rupee box.
 *
 * Narrow and unlabelled-by-`<Field>` on purpose: three of these sit in a
 * row inside a list row, where a stacked label per box would make each
 * product twice as tall. Non-numeric input is dropped as it is typed —
 * the route rejects it anyway, and catching it here means a stray letter
 * never costs a round trip.
 */
function Money({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-micro text-muted">
      {label}
      <span className="flex items-center gap-0.5 rounded-lg border border-line bg-bg px-2 py-1 focus-within:border-accent">
        <span className="text-ink">₹</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder={placeholder}
          inputMode="decimal"
          className="nums w-20 bg-transparent text-caption text-ink outline-none placeholder:text-faint"
        />
      </span>
    </label>
  );
}
