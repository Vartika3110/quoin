import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/browse/Browse";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import {
  getCategories,
  getProductFacets,
  listProducts,
} from "@/lib/data/catalog";
import { readBrowseParams, toProductQuery } from "@/lib/browse-request";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All products — Quoin",
  description:
    "Every priced line in the Quoin catalogue — materials, fittings and finishes, filterable by brand, price and delivery.",
  /* The listing is reachable with any combination of filter, sort and
     page in the query string, and every one of those renders the same
     department index. One canonical, so they do not compete. */
  alternates: { canonical: "/products" },
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
  const [result, facets, departments] = await Promise.all([
    listProducts(query),
    getProductFacets(query),
    getCategories(),
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

        {/* A visible heading only when there is something to say that the
            page does not already show.

            "All products" over a grid of all products, with a line
            counting the departments under it, is the page describing
            itself to somebody who is looking at it — and it pushed the
            first row of goods down the screen to do it. The breadcrumb
            already says where this is. A search is different: "Results
            for X" is the one thing the grid cannot tell you, because a
            grid of results looks exactly like a grid.

            The heading still exists when it is not drawn — `sr-only`, the
            same arrangement `/c/[slug]` uses. A page with no `h1` is one a
            screen reader cannot summarise and a crawler reads as
            untitled; that is a cost with no visible benefit, which is the
            kind worth paying attention to. */}
        {searching ? (
          <SectionHead level={1} size="lg" title={`Results for “${params.q}”`} />
        ) : (
          <h1 className="sr-only">All products</h1>
        )}

        <Browse
          page={result}
          facets={facets}
          basePath="/products"
          params={params}
          /* Not while searching: a department chip would silently drop
             the query it took someone three words to type. */
          departments={searching ? undefined : departments}
        />
      </div>
    </AppShell>
  );
}
