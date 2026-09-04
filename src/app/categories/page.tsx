import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import {
  CategoryTile,
  CATEGORY_DESCRIPTOR,
} from "@/components/storefront/CategoryTile";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { getCategories, getCategoryPriceFloors } from "@/lib/data/catalog";
import { formatPrice } from "@/lib/types/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Categories — Quoin",
  description:
    "Every department Quoin sells from — structure, finishes, fittings, electricals and services.",
};

export default async function CategoriesPage() {
  const [categories, priceFloors] = await Promise.all([
    getCategories(),
    getCategoryPriceFloors(),
  ]);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Categories" }]} />
        </div>

        <SectionHead
          level={1}
          size="lg"
          title="Shop by category"
          subtitle={`${categories.length} departments, priced from manufacturer lists.`}
        />

        <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0">
          {categories.map((category, i) => {
            const floor = priceFloors.get(category.id);
            return (
              <CategoryTile
                key={category.id}
                category={category}
                fill
                priority={i < 4}
                descriptor={CATEGORY_DESCRIPTOR[category.slug]}
                caption={
                  floor != null
                    ? `From ${formatPrice(floor)}`
                    : `${category.productCount} products`
                }
              />
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
