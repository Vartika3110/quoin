import Link from "next/link";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckRow, Field, Input, Select } from "@/components/ui/Input";
import { Stat } from "@/components/ui/Stat";
import { Box, Search } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { one } from "@/lib/search-params";
import {
  getInventoryStats,
  listActiveStores,
  listInventoryItems,
} from "@/lib/data/inventory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inventory — Quoin",
  robots: { index: false, follow: false },
};

/**
 * The stock list.
 *
 * Almost the entire catalogue is not stock-tracked — `Product.stockTracked`
 * defaults to off, see the module comment in `src/lib/data/inventory.ts` —
 * so an empty list here has to mean "nothing is being tracked yet", never
 * "everything is out of stock". Getting that distinction wrong on the
 * first screen a warehouse opens is how a working storefront gets read as
 * a broken one, so the two empty states below are deliberately different
 * screens rather than one with different words.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const sp = await searchParams;
  const q = one(sp.q)?.trim() || undefined;
  const storeId = one(sp.store) || undefined;
  const lowOnly = one(sp.low) === "1";
  const page = Number(one(sp.page)) || 1;

  const [{ items, total, totalPages, totalTrackedAnywhere }, stats, stores] = await Promise.all([
    listInventoryItems({ storeId, lowStockOnly: lowOnly, search: q, page }),
    getInventoryStats(),
    listActiveStores(),
  ]);

  const filtersActive = Boolean(q || storeId || lowOnly);

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (storeId) params.set("store", storeId);
    if (lowOnly) params.set("low", "1");
    params.set("page", String(target));
    return `/admin/inventory?${params.toString()}`;
  }

  return (
    <AdminShell
      current="/admin/inventory"
      title="Inventory"
      subtitle="Stock is opt-in. Most of the catalogue sells with no stock check at all."
      actions={<Button href="/admin/inventory/track">Start tracking a variant</Button>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Tracked items" value={stats.totalTracked} icon={<Box className="size-4" />} />
        <Stat
          label="Low stock"
          value={stats.lowStock}
          tone={stats.lowStock > 0 ? "accent" : "plain"}
        />
        <Stat
          label="Out of stock"
          value={stats.outOfStock}
          tone={stats.outOfStock > 0 ? "accent" : "plain"}
        />
      </div>

      {totalTrackedAnywhere === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Box className="size-6" />}
          title="Nothing is tracked yet"
          action={{ href: "/admin/inventory/track", label: "Start tracking a variant" }}
        >
          This is not the same as being out of stock. Tracking is switched on per
          product and defaults to off — almost the entire catalogue has never had
          its stock counted in, and it sells with no stock check at all until that
          happens here.
        </EmptyState>
      ) : (
        <>
          <Card className="mt-6" padding="md">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <Field label="Search" htmlFor="q" className="min-w-[220px] flex-1">
                <Input
                  id="q"
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder="Product name or SKU"
                  leading={<Search className="size-4" />}
                />
              </Field>
              <Field label="Store" htmlFor="store" className="w-48">
                <Select id="store" name="store" defaultValue={storeId ?? ""}>
                  <option value="">All stores</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <CheckRow
                label="Low stock only"
                name="low"
                value="1"
                defaultChecked={lowOnly}
                className="w-auto"
              />
              <Button type="submit" variant="outline">
                Filter
              </Button>
              {filtersActive && (
                <Button href="/admin/inventory" variant="ghost">
                  Clear
                </Button>
              )}
            </form>
          </Card>

          {items.length === 0 ? (
            <EmptyState
              className="mt-6"
              title="No items match these filters"
              action={{ href: "/admin/inventory", label: "Clear filters" }}
            >
              Nothing tracked matches this search, store or low-stock filter. Other
              tracked items exist — try a broader search or clear the filters.
            </EmptyState>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-card border border-line-soft">
              <table className="w-full text-body-sm">
                <thead className="bg-raised text-left text-micro font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Store</th>
                    <th className="px-4 py-3 text-right">On hand</th>
                    <th className="px-4 py-3 text-right">Reserved</th>
                    <th className="px-4 py-3 text-right">Available</th>
                    <th className="px-4 py-3 text-right">Threshold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {items.map((row) => (
                    <tr key={row.id} className="hover:bg-hover">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/inventory/${row.id}`}
                          className="font-medium text-ink hover:text-accent"
                        >
                          {row.productName}
                        </Link>
                        <p className="text-micro text-muted">{row.variantLabel}</p>
                      </td>
                      <td className="nums px-4 py-3 text-muted">{row.variantSku}</td>
                      <td className="px-4 py-3 text-muted">{row.storeName}</td>
                      <td className="nums px-4 py-3 text-right text-ink">{row.onHandQty}</td>
                      <td className="nums px-4 py-3 text-right text-muted">{row.reservedQty}</td>
                      <td className="nums px-4 py-3 text-right font-medium text-ink">
                        {row.availableQty}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.lowStock ? (
                          <Badge tone="warning">≤ {row.lowStockThreshold}</Badge>
                        ) : (
                          <span className="nums text-muted">{row.lowStockThreshold}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-4 text-caption">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="text-accent">
                  Previous
                </Link>
              ) : (
                <span className="text-faint">Previous</span>
              )}
              <span className="text-muted">
                Page {page} of {totalPages} · {total} item{total === 1 ? "" : "s"}
              </span>
              {page < totalPages ? (
                <Link href={pageHref(page + 1)} className="text-accent">
                  Next
                </Link>
              ) : (
                <span className="text-faint">Next</span>
              )}
            </nav>
          )}
        </>
      )}
    </AdminShell>
  );
}
