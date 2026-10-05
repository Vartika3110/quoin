import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/browse/Browse";
import { CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import {
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
          /* No department rail here, deliberately.
 
             It is a phone-only row of every *other* department, and this
             page opens with the department's name in display type and its
             description underneath. A reader who has just arrived at
             Bathware & plumbing does not need thirteen chips offering to
             take them somewhere else before they have seen a tap — it
             answers "where am I" a second time, in a worse voice, and
             pushes the first product further down the screen.
 
             Switching department is still one tap: the header's Categories
             menu carries all fourteen at every width, which is where
             somebody goes when they want a different one. The rail stays
             on /products, where it is doing the opposite job — there is no
             department in the path there and the filter panel has no
             category facet, so it is the only way to narrow from inside
             the page. */
          /* The department is in the path, not the query string, so the
             grid has to be told about it to fetch its own next page. */
          scope={{ category: slug }}
        />
      </div>
    </AppShell>
  );
}
