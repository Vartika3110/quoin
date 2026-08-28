import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/Browse";
import { SectionHead } from "@/components/storefront/sections";
import { getCategoryBySlug, listProducts, type ProductSort } from "@/lib/data/catalog";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  return { title: category ? `${category.title} — Quoin` : "Not found — Quoin" };
}

export default async function CategoryPage({ params, searchParams }: Ctx) {
  const { slug } = await params;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const sp = await searchParams;
  const query = { sort: one(sp.sort), page: one(sp.page) };

  const result = await listProducts({
    categorySlug: slug,
    sort: query.sort as ProductSort | undefined,
    page: Number(query.page) || 1,
  });

  return (
    <AppShell>
      <div className="pt-4 lg:pt-0">
        <SectionHead title={category.title} />
        <Browse page={result} basePath={`/c/${slug}`} params={query} />
      </div>
    </AppShell>
  );
}
