import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { CategoryGrid, SectionHead } from "@/components/storefront/sections";
import { getCategories } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Categories — Quoin",
};

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <AppShell>
      <div className="pt-4 lg:pt-0">
        <SectionHead title="Shop by Category" />
        <CategoryGrid categories={categories} />
      </div>
    </AppShell>
  );
}
