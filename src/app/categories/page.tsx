import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { CategoryGridTile } from "@/components/storefront/CategoryGridTile";
import { getCategories } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Products — Quoin",
  description:
    "Every department Quoin sells from — structure, finishes, fittings, electricals and services.",
};

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        {/* No breadcrumb, for the reason given on `/c/[slug]`: "Home ›
            Products" over a heading reading "Shop by Category" is a line
            of chrome above the only thing on the page. */}

        {/* "Shop by Category", and nothing under it.

            The line that used to sit here — "14 departments, priced from
            manufacturer lists" — was a caption on a grid that shows
            exactly that, and on a phone it cost a row of the thing it
            was describing. The count is visible by counting, and the
            pricing claim belongs on the department pages, where there
            are prices to make it about. */}
        <h1 className="mb-4 px-5 font-display text-head-lg text-ink lg:px-0">
          Shop by Category
        </h1>

        {/* Three across on a phone, which is the reference's grid and
            what makes the whole department list legible without
            scrolling three times. It is also why the tiles lost their
            price pills and their descriptors: at 105px a square there is
            room for a photograph and a name, and anything else set in it
            is type nobody reads. */}
        <ul className="grid grid-cols-3 gap-x-3 gap-y-5 px-5 sm:grid-cols-4 lg:grid-cols-5 lg:px-0">
          {categories.map((category, i) => (
            <li key={category.id}>
              <CategoryGridTile category={category} priority={i < 6} />
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
