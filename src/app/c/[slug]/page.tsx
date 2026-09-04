import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/browse/Browse";
import { CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { getCategoryBySlug, getProductFacets, listProducts } from "@/lib/data/catalog";
import { readBrowseParams, toProductQuery } from "@/lib/browse-request";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Not found — Quoin" };
  return {
    title: `${category.title} — Quoin`,
    description:
      CATEGORY_DESCRIPTOR[slug] ??
      `${category.productCount} products in ${category.title} on Quoin.`,
  };
}

export default async function CategoryPage({ params, searchParams }: Ctx) {
  const { slug } = await params;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const browseParams = readBrowseParams(await searchParams);
  const query = { ...toProductQuery(browseParams), categorySlug: slug };

  const [result, facets] = await Promise.all([
    listProducts(query),
    getProductFacets(query),
  ]);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Categories", href: "/categories" },
              { label: category.title },
            ]}
          />
        </div>

        <SectionHead
          level={1}
          size="lg"
          title={category.title}
          subtitle={CATEGORY_DESCRIPTOR[slug]}
        />

        <Browse
          page={result}
          facets={facets}
          basePath={`/c/${slug}`}
          params={browseParams}
        />
      </div>
    </AppShell>
  );
}
