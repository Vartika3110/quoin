import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/browse/Browse";
import { CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import {
  getCategories,
  getCategoryBySlug,
  getProductFacets,
  listProducts,
} from "@/lib/data/catalog";
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

  const title = `${category.title} — Quoin`;
  const description =
    CATEGORY_DESCRIPTOR[slug] ??
    `${category.productCount} products in ${category.title} on Quoin.`;

  return {
    title,
    description,
    /* Bare `/c/{slug}`, with no query string. A department is reachable
       with any combination of brand, size, price and sort applied, and
       every one of those is the same set of products in a different
       order — without this, each filter combination is a separate URL
       competing with the others for the same department. */
    alternates: { canonical: `/c/${slug}` },
    openGraph: {
      title,
      description,
      url: `/c/${slug}`,
      type: "website",
      siteName: "Quoin",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function CategoryPage({ params, searchParams }: Ctx) {
  const { slug } = await params;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const browseParams = readBrowseParams(await searchParams);
  const query = { ...toProductQuery(browseParams), categorySlug: slug };

  const [result, facets, departments] = await Promise.all([
    listProducts(query),
    getProductFacets(query),
    getCategories(),
  ]);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        {/* No breadcrumb.

            "Home › Categories › Bathware & plumbing" sat above the
            department rail, which already has Bathware & plumbing lit in
            it, directly under a header carrying the wordmark that goes
            home. It was a third answer to "where am I" stacked on two
            that were already on screen, and it cost a line at the top of
            a phone — where the last several rounds of this have all been
            about getting the goods further up the page.

            Nothing is lost structurally: `Breadcrumb` is presentational,
            with no `BreadcrumbList` JSON-LD behind it, so this is not a
            rich result going away. The `h1` below still names the page
            for a crawler and a screen reader. */}

        {/* The department's name is in the breadcrumb directly above, in
            the browser tab, and in the chip the filter bar lights when a
            filter is on. A second copy of it set in display serif, with a
            description under it, was most of a phone screen spent saying
            a thing the line above it had already said — and it stood
            between the reader and the first product.

            The heading itself stays, because a page owes assistive
            technology and a crawler one, and a category page with no `h1`
            has no name as far as either is concerned. It is read, not
            drawn: `sr-only` keeps it in the document outline and out of
            the layout.

            The descriptor goes with it. "Sanitaryware, taps, showers and
            pipes" is useful the first time somebody wonders what the
            department covers, and it is still the page's meta description
            and still on the category tile they tapped to get here. */}
        <h1 className="sr-only">{category.title}</h1>

        <Browse
          page={result}
          facets={facets}
          basePath={`/c/${slug}`}
          params={browseParams}
          /* The department rail is back, at the owner's instruction that
             the app match the design reference, which carries it on this
             screen. The argument for cutting it was that a reader who has
             just arrived at Bathware does not need thirteen chips
             offering to take them somewhere else before they have seen a
             tap — and that argument was answered rather than overruled:
             the row underneath is now the one that narrows *this*
             department, so the two together read as "which department,
             then which shelf" instead of a row that only ever leaves.

             It also costs less than it did. The display heading and the
             descriptor that used to sit above the grid are gone, so the
             chips occupy space the page was already spending on saying
             where it was. */
          departments={departments}
          activeDepartment={slug}
          /* Turns on the sub-category row under the rail, and names its
             "All …" chip. */
          departmentTitle={category.title}
          /* The department is in the path, not the query string, so the
             grid has to be told about it to fetch its own next page. */
          scope={{ category: slug }}
        />
      </div>
    </AppShell>
  );
}
