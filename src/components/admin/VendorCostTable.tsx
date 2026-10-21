"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/types/catalog";
import { rupeesToPaise, InvalidRupeeAmountError } from "@/lib/services/booking-helpers";

/**
 * What Quoin pays for each of a vendor's lines, against what it charges.
 *
 * This is the screen where a vendor becomes payable: a weekly statement
 * is arithmetic on cost price, and an uncosted line cannot appear on
 * one. So the table is built for sitting down with a price list and
 * typing — every row is an input, saving is per row, and the margin
 * updates as soon as the server agrees.
 *
 * **Rupees in, paise stored.** The box takes what a person reads off an
 * invoice and `rupeesToPaise` turns it into an integer by shifting the
 * decimal, never by multiplying a float: ₹1,250.10 × 100 is
 * 125009.99999999999 in IEEE 754, and a cost that is a paisa light
 * makes every margin and every payout wrong by a rounding error that
 * compounds across a week.
 *
 * **Blank clears the cost rather than setting zero.** Absent means
 * nobody has costed this line, which is a different fact from "it costs
 * nothing", and the statement has to skip the first and pay the second.
 */

export interface CostRow {
  sku: string;
  name: string;
  variantId: string;
  pricePaise: number;
  costPaise: number | null;
}

export function VendorCostTable({
  vendorId,
  rows,
}: {
  vendorId: string;
  rows: CostRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.variantId, r.costPaise == null ? "" : (r.costPaise / 100).toFixed(2)]),
    ),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [problem, setProblem] = useState<Record<string, string>>({});

  async function save(row: CostRow) {
    const typed = (draft[row.variantId] ?? "").trim();

    let costPaise: number | null = null;
    if (typed !== "") {
      try {
        costPaise = rupeesToPaise(typed);
      } catch (error) {
        setProblem((p) => ({
          ...p,
          [row.variantId]:
            error instanceof InvalidRupeeAmountError ? error.message : "Not an amount.",
        }));
        return;
      }
    }

    setProblem((p) => ({ ...p, [row.variantId]: "" }));
    setSaving(row.variantId);
    try {
      const res = await fetch(`/api/v1/admin/vendors/${vendorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cost", variantId: row.variantId, costPaise }),
      });
      if (!res.ok) {
        const body = await res.json();
        toast.error(body?.error?.message ?? "Could not save that cost");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Network error — the cost was not saved");
    } finally {
      setSaving(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-body-sm text-muted">
        No products are pointed at this vendor yet. Until some are, there is
        nothing to cost and nothing to pay.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="hidden grid-cols-[1fr_7rem_7rem_6rem] gap-3 px-2 pb-1 text-micro font-semibold uppercase tracking-wide text-muted sm:grid">
        <span>Product</span>
        <span className="text-right">We charge</span>
        <span className="text-right">We pay</span>
        <span className="text-right">Margin</span>
      </div>

      {rows.map((row) => {
        const live = (draft[row.variantId] ?? "").trim();
        /* The margin shown is the *saved* one, not the typed one: a
           number that moves while you type reads as a calculation, and
           this one is a fact about what is stored. */
        const margin = row.costPaise == null ? null : row.pricePaise - row.costPaise;
        const pct =
          margin == null || row.pricePaise === 0
            ? null
            : Math.round((margin / row.pricePaise) * 1000) / 10;

        return (
          <div
            key={row.variantId}
            className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2 py-2 odd:bg-surface sm:grid-cols-[1fr_7rem_7rem_6rem]"
          >
            <div className="min-w-0">
              <p className="truncate text-body-sm text-ink" title={row.name}>
                {row.name}
              </p>
              <p className="nums text-micro text-muted">{row.sku}</p>
            </div>

            <span className="nums hidden text-right text-body-sm text-ink sm:block">
              {formatPrice(row.pricePaise)}
            </span>

            <div>
              <Input
                value={draft[row.variantId] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [row.variantId]: e.target.value }))
                }
                onBlur={() => {
                  const stored = row.costPaise == null ? "" : (row.costPaise / 100).toFixed(2);
                  if (live !== stored) void save(row);
                }}
                placeholder="—"
                inputMode="decimal"
                maxLength={12}
                aria-label={`Cost for ${row.name}`}
                aria-invalid={problem[row.variantId] ? true : undefined}
                className="nums h-9 w-28 text-right"
                disabled={saving === row.variantId}
              />
              {problem[row.variantId] && (
                <p role="alert" className="mt-0.5 text-micro text-danger">
                  {problem[row.variantId]}
                </p>
              )}
            </div>

            <span
              className={
                "nums hidden text-right text-body-sm sm:block " +
                (margin == null
                  ? "text-faint"
                  : margin < 0
                    ? "text-danger"
                    : "text-ink")
              }
            >
              {margin == null ? "—" : `${pct}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
