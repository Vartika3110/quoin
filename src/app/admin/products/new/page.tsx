import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { NewProductForm } from "@/components/admin/NewProductForm";
import { Card } from "@/components/ui/Card";
import { requireStaffPage } from "@/lib/auth/staff";
import { listCatalogueBrands, listCatalogueCategories } from "@/lib/data/catalog-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add a product — Quoin",
  robots: { index: false, follow: false },
};

/**
 * One product, typed in.
 *
 * The bulk path is `npm run db:import`, which takes a manufacturer's CSV
 * and is idempotent on SKU. This is for the ordinary other case — a
 * supplier starts stocking one line and it has to be sellable today —
 * which until now meant either editing the CSV and re-running the import
 * or opening Prisma Studio.
 *
 * Brands and categories are chosen from what exists rather than typed:
 * both are `onDelete: Restrict` relations with unique slugs, and letting
 * this form mint them would put "Hafele", "Häfele" and "HAFELE" in the
 * brand table inside a week.
 */
export default async function NewProductPage() {
  await requireStaffPage();

  const [brands, categories] = await Promise.all([
    listCatalogueBrands(),
    listCatalogueCategories(),
  ]);

  return (
    <AdminShell
      current="/admin/products"
      title="Add a product"
      subtitle="For a single line. A whole supplier catalogue goes through the importer instead."
    >
      <Card padding="lg">
        <NewProductForm brands={brands} categories={categories} />
      </Card>
    </AdminShell>
  );
}
