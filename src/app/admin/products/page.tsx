import Link from "next/link";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProductRow } from "@/components/admin/ProductRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Input";
import { Stat } from "@/components/ui/Stat";
import { Plus, Search, Tag, Upload } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { one } from "@/lib/search-params";
import {
  getCatalogueStats,
  listCatalogueBrands,
  listCatalogueCategories,
  listCatalogueProducts,
  type CatalogueStatus,
} from "@/lib/data/catalog-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Products — Quoin",
  /* An internal tool has no business in a search index. */
  robots: { index: false, follow: false },
};

const STATUSES: CatalogueStatus[] = ["live", "unpriced", "hidden", "retired"];

function asStatus(value: string | undefined): CatalogueStatus | undefined {
  return STATUSES.includes(value as CatalogueStatus) ? (value as CatalogueStatus) : undefined;
}

/**
 * The catalogue, end to end.
 *
 * Everything Quoin sells is on this screen, plus everything it has
 * stopped selling and everything it cannot sell yet — a product missing
 * from the shop is the main thing someone opens this page to explain, and
 * a list filtered to the sellable rows could never answer it. The status
 * chip on each row says which of the three it is.
 *
 * `/admin/pricing` still exists and still has a job: it is the queue of
 * the ~880 imported rows that arrived with no price, worked top to bottom
 * in a sitting. This is the other half of the same problem — finding one
 * named product among thousands and changing it. Pricing is a queue, this
 * is a register, and collapsing them would make both worse.
 *
 * Writes land straight on the storefront. `/`, `/products` and `/p/[slug]`
 * are all `force-dynamic` and nothing in the app caches catalogue reads,
 * so the next request after a save sees the new figure. There is no
 * publish step and nothing to invalidate.
 *
 * Staff only, and a non-staff visitor gets the 404 rather than a refusal
 * — telling someone an internal tool lives at this URL is free
 * reconnaissance, and they cannot use it either way.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const sp = await searchParams;
  const q = one(sp.q)?.trim() || undefined;
  const brandSlug = one(sp.brand) || undefined;
  const categorySlug = one(sp.category) || undefined;
  const status = asStatus(one(sp.status));
  const page = Number(one(sp.page)) || 1;

  const [{ items, total, totalPages }, stats, brands, categories] = await Promise.all([
    listCatalogueProducts({ q, brandSlug, categorySlug, status, page }),
    getCatalogueStats(),
    listCatalogueBrands(),
    listCatalogueCategories(),
  ]);

  const filtered = Boolean(q || brandSlug || categorySlug || status);

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (brandSlug) params.set("brand", brandSlug);
    if (categorySlug) params.set("category", categorySlug);
    if (status) params.set("status", status);
    params.set("page", String(target));
    return `/admin/products?${params.toString()}`;
  }

  return (
    <AdminShell
      current="/admin/products"
      title="Products"
      subtitle="Everything in the catalogue. Price changes and retirements are on the storefront immediately."
      actions={
        <>
          <Button href="/admin/products/import" variant="outline">
            <Upload className="size-4" />
            Bulk upload
          </Button>
          <Button href="/admin/products/new">
            <Plus className="size-4" />
            Add a product
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In the catalogue" value={stats.total} icon={<Tag className="size-4" />} />
        <Stat label="Live in the shop" value={stats.live} tone="success" />
        <Stat
          label="No price"
          value={stats.unpriced}
          tone={stats.unpriced > 0 ? "accent" : "plain"}
          hint={stats.unpriced > 0 ? <Link href="/admin/pricing" className="text-accent">Work the queue</Link> : undefined}
        />
        <Stat label="Retired" value={stats.retired} />
      </div>

      <Card className="mt-6" padding="md">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Search" htmlFor="q" className="min-w-[220px] flex-1">
            <Input
              id="q"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Name, product code or brand"
              leading={<Search className="size-4" />}
            />
          </Field>
          <Field label="Brand" htmlFor="brand" className="w-44">
            <Select id="brand" name="brand" defaultValue={brandSlug ?? ""}>
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="category" className="w-44">
            <Select id="category" name="category" defaultValue={categorySlug ?? ""}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status" className="w-40">
            <Select id="status" name="status" defaultValue={status ?? ""}>
              <option value="">Any status</option>
              <option value="live">Live</option>
              <option value="unpriced">No price</option>
              <option value="hidden">Hidden</option>
              <option value="retired">Retired</option>
            </Select>
          </Field>
          <Button type="submit" variant="outline">
            Filter
          </Button>
          {filtered && (
            <Button href="/admin/products" variant="ghost">
              Clear
            </Button>
          )}
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Tag className="size-6" />}
          title={filtered ? "Nothing matches these filters" : "The catalogue is empty"}
          action={
            filtered
              ? { href: "/admin/products", label: "Clear filters" }
              : { href: "/admin/products/new", label: "Add a product" }
          }
        >
          {filtered
            ? "No product matches this search, brand, category or status. Try a broader search or clear the filters."
            : "Nothing has been imported or added yet. Run the catalogue importer, or add a single product by hand."}
        </EmptyState>
      ) : (
        <>
          <p className="mt-6 text-caption text-muted">
            {total.toLocaleString("en-IN")} product{total === 1 ? "" : "s"}
            {filtered ? " match" : ""}
            {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
          </p>

          <ul className="mt-2 space-y-2">
            {items.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-4 text-caption">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="text-accent">
                  Previous
                </Link>
              ) : (
                <span className="text-faint">Previous</span>
              )}
              <span className="text-muted">
                Page {page} of {totalPages}
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
