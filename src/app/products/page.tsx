import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/Browse";
import { SectionHead } from "@/components/storefront/sections";
import { listProducts, type ProductSort } from "@/lib/data/catalog";
import type { FulfilmentType } from "@/lib/types/catalog";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All products — Quoin",
};

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const params = {
    category: one(sp.category),
    brand: one(sp.brand),
    fulfilment: one(sp.fulfilment),
    q: one(sp.q),
    sort: one(sp.sort),
    page: one(sp.page),
  };

  const result = await listProducts({
    categorySlug: params.category,
    brandSlug: params.brand,
    fulfilment: params.fulfilment as FulfilmentType | undefined,
    search: params.q,
    sort: params.sort as ProductSort | undefined,
    page: Number(params.page) || 1,
  });

  return (
    <AppShell>
      <div className="pt-4 lg:pt-0">
        <SectionHead title={params.q ? `Results for "${params.q}"` : "All products"} />
        <Browse page={result} basePath="/products" params={params} />
      </div>
    </AppShell>
  );
}
