import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/Browse";
import { SectionHead } from "@/components/storefront/sections";
import { listDiscountedProducts } from "@/lib/data/catalog";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Deals — Quoin" };

/**
 * Products selling below their list price.
 *
 * Derived, not curated: a product appears here because its sell price is
 * under its MRP, so the page cannot advertise a saving that a customer
 * would not actually get at checkout. Both catalogue imports set the two
 * equal, so this is empty until a merchandiser prices a discount — which
 * is the honest state, and better than a page of invented offers.
 */
export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const params = { sort: one(sp.sort), page: one(sp.page) };
  const result = await listDiscountedProducts(Number(params.page) || 1);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-0">
        <SectionHead title="Deals" />
        {result.total === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted lg:px-0">
            No offers running today. Everything is at list price.
          </p>
        ) : (
          <Browse page={result} basePath="/deals" params={params} />
        )}
      </div>
    </AppShell>
  );
}
