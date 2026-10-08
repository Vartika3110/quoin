import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProductImportForm } from "@/components/admin/ProductImportForm";
import { requireStaffPage } from "@/lib/auth/staff";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bulk upload — Quoin",
  robots: { index: false, follow: false },
};

/**
 * A spreadsheet of products, applied to the catalogue.
 *
 * Sits between the two tools that already existed: `/admin/products/new`
 * is one line typed by hand, and `npm run db:import` is a whole supplier
 * export run by a developer against a CSV in the repository. The case
 * neither covers is the ordinary one — a price list arrives by email and
 * needs to be live this afternoon, and nobody should have to commit a
 * file and deploy to make that happen.
 *
 * Same join key as the importer (`sku`), same idempotency, same refusal
 * to invent provenance or claim `INSTANT`.
 */
export default async function ImportProductsPage() {
  await requireStaffPage();

  return (
    <AdminShell
      current="/admin/products"
      title="Bulk upload"
      subtitle="Add or reprice many products from a spreadsheet. Nothing is written until you have seen what will change."
    >
      <ProductImportForm />
    </AdminShell>
  );
}
