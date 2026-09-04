import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/browse/Browse";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { getProductFacets, listProducts } from "@/lib/data/catalog";
import { readBrowseParams, toProductQuery } from "@/lib/browse-request";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All products — Quoin",
  description:
    "Every priced line in the Quoin catalogue — materials, fittings and finishes, filterable by brand, price and delivery.",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = readBrowseParams(await searchParams);
  const query = toProductQuery(params);

  /* The listing and its facets in one round trip rather than two
     sequential ones — the facets are four aggregate queries and would
     otherwise wait for the page of products to come back first. */
  const [result, facets] = await Promise.all([
    listProducts(query),
    getProductFacets(query),
  ]);

  const searching = Boolean(params.q);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: searching ? "Search" : "All products" },
            ]}
          />
        </div>

        <SectionHead
          level={1}
          size="lg"
          title={searching ? `Results for “${params.q}”` : "All products"}
          subtitle={
            searching
              ? undefined
              : "Everything Quoin has priced for sale, across all fourteen departments."
          }
        />

        <Browse page={result} facets={facets} basePath="/products" params={params} />
      </div>
    </AppShell>
  );
}
