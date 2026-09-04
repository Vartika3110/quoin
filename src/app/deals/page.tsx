import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/browse/Browse";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/Section";
import { Percent } from "@/components/icons";
import { getProductFacets, listProducts } from "@/lib/data/catalog";
import { readBrowseParams, toProductQuery } from "@/lib/browse-request";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deals — Quoin",
  description: "Everything currently priced below its manufacturer list price.",
};

/**
 * Products selling below their list price.
 *
 * Derived, not curated: a product appears here because its sell price is
 * under its MRP, so the page cannot advertise a saving a customer would
 * not actually get at checkout. Both catalogue imports set the two equal,
 * so this is empty until a merchandiser prices a discount — which is the
 * honest state, and better than a page of invented offers.
 *
 * The brief asks for curated shelves here — Limited Time, Best Value,
 * Professional Picks, Bulk Deals. Each of those is a merchandising
 * decision with no field behind it, and inventing the shelves would mean
 * inventing the products in them. They arrive with a `promotion` table.
 */
export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = readBrowseParams(await searchParams);
  /* The page *is* the offers filter, so it is forced on rather than
     offered in the panel — and hidden from the panel for the same reason. */
  const query = { ...toProductQuery(params), discountedOnly: true };

  const [result, facets] = await Promise.all([
    listProducts(query),
    getProductFacets(query),
  ]);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Deals" }]} />
        </div>

        <SectionHead
          level={1}
          size="lg"
          title="Deals"
          subtitle="Every line whose sell price is currently under its list price. Nothing here is a countdown."
        />

        {result.total === 0 ? (
          <div className="px-5 lg:px-0">
            <EmptyState
              icon={<Percent className="size-6" />}
              title="No offers running today"
              action={{ href: "/products", label: "Browse the catalogue" }}
              secondaryAction={{ href: "/pro", label: "See Quoin Pro" }}
            >
              Everything is at list price. Quoin does not run a permanent
              sale — when a price drops below the manufacturer list, it
              appears here and the saving is real.
            </EmptyState>
          </div>
        ) : (
          <Browse
            page={result}
            facets={facets}
            basePath="/deals"
            params={params}
          />
        )}
      </div>
    </AppShell>
  );
}
