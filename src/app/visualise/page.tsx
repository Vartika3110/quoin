import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Visualiser } from "@/components/storefront/visualise/Visualiser";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/Section";
import { Camera } from "@/components/icons";
import { getCategories, getProductBySlug } from "@/lib/data/catalog";
import {
  isOwnPhoto,
  sameOriginSrc,
  tileSizeFromTitle,
  visualiserKindFor,
} from "@/lib/visualise/kind";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "See it in your space — Quoin",
  description: "Try a Quoin product on your own photograph before you buy.",
  /* A tool, not content: one URL per product would be thousands of thin
     pages for a crawler to index. */
  robots: { index: false },
};

/**
 * `/visualise?product=<slug>` — try a product on a photograph of your room.
 *
 * The page is a thin server shell: it decides *whether* the product can be
 * visualised and *how* (`visualiserKindFor`), and hands the browser a
 * same-origin picture to draw. Everything after that — the camera, the
 * photograph, the placement — happens client-side, and the customer's room
 * photo never reaches a server.
 */
export default async function VisualisePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  const { product: raw } = await searchParams;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) notFound();

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const categories = await getCategories();
  const category = categories.find((c) => c.id === product.categoryId);

  const kind = visualiserKindFor({
    title: product.title,
    categorySlug: category?.slug,
    fulfilment: product.fulfilment,
    hasUsablePhoto: isOwnPhoto(product.photo),
  });

  const back = `/p/${product.slug}`;

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-4 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: product.title, href: back },
              { label: "See it in your space" },
            ]}
          />
        </div>

        <SectionHead
          level={1}
          title="See it in your space"
          subtitle={product.title}
          className="px-5 lg:px-0"
        />

        {kind && isOwnPhoto(product.photo) ? (
          <Visualiser
            product={{
              title: product.title,
              brand: product.brand,
              photoSrc: sameOriginSrc(product.photo),
              photoIsIllustration: Boolean(product.photoIsIllustration),
              kind,
              tileMm: tileSizeFromTitle(product.title) ?? [600, 600],
            }}
          />
        ) : (
          <div className="px-5 lg:px-0">
            <EmptyState
              icon={<Camera className="size-5" />}
              title="This one can't be previewed yet"
              action={{ href: back, label: "Back to the product" }}
            >
              A preview needs a clear picture of the product, and it only makes sense for things
              that go on a wall or floor or sit in a room. A free video consultation can still help
              you choose.
            </EmptyState>
          </div>
        )}
      </div>
    </AppShell>
  );
}
