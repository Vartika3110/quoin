import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { StockTrackForm } from "@/components/admin/StockTrackForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";
import { requireStaffPage } from "@/lib/auth/staff";
import { one } from "@/lib/search-params";
import {
  getVariantForTracking,
  listActiveStores,
  searchTrackableVariants,
} from "@/lib/data/inventory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Start tracking stock — Quoin",
  robots: { index: false, follow: false },
};

/**
 * Turns stock tracking on for one variant at one store.
 *
 * Two steps, both server-rendered search-then-pick like `/admin/images`:
 * find the variant, then hand off to `StockTrackForm` — the one part of
 * this screen that has to be a client component, because it is the part
 * that writes.
 */
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const sp = await searchParams;
  const q = one(sp.q)?.trim() ?? "";
  const variantId = one(sp.variantId);

  if (variantId) {
    const variant = await getVariantForTracking(variantId);
    if (!variant) notFound();

    const stores = await listActiveStores();

    return (
      <AdminShell current="/admin/inventory" title="Start tracking a variant">
        <Card padding="lg">
          <CardHeader
            title={variant.productName}
            subtitle={`${variant.label} · ${variant.sku}`}
            action={
              <Link href="/admin/inventory/track" className="text-caption text-accent">
                Choose a different variant
              </Link>
            }
          />
          {variant.productStockTracked && (
            <p className="mb-4 text-body-sm text-muted">
              This product already tracks stock at another store. Adding one here
              starts a fresh count for this store only.
            </p>
          )}
          <StockTrackForm variantId={variant.id} stores={stores} />
        </Card>
      </AdminShell>
    );
  }

  const results = q ? await searchTrackableVariants(q) : [];

  return (
    <AdminShell
      current="/admin/inventory"
      title="Start tracking a variant"
      subtitle="Search the catalogue for the variant to count in."
    >
      <Card padding="lg">
        <form method="get" className="flex items-end gap-3">
          <Field label="Product name or SKU" htmlFor="q" className="min-w-[260px] flex-1">
            <Input id="q" name="q" defaultValue={q} placeholder="e.g. Ambuja Cement 50kg" />
          </Field>
          <Button type="submit">Search</Button>
        </form>
      </Card>

      <div className="mt-6">
        {q && results.length === 0 && (
          <EmptyState title="No matching variant" compact>
            Nothing in the catalogue matches “{q}”.
          </EmptyState>
        )}

        {results.length > 0 && (
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/inventory/track?variantId=${r.id}`}
                  className="flex items-center justify-between gap-4 rounded-card border border-line-soft bg-surface p-3 hover:border-line hover:bg-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body text-ink">{r.productName}</p>
                    <p className="text-micro text-muted">
                      {r.label} · {r.sku} · {r.productSku}
                    </p>
                  </div>
                  {r.productStockTracked && <Badge tone="info">tracks stock elsewhere</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
