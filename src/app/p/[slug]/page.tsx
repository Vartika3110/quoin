import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { PurchasePanel } from "@/components/storefront/PurchasePanel";
import { Gallery } from "@/components/storefront/product/Gallery";
import { Specs } from "@/components/storefront/product/Specs";
import { RecordView } from "@/components/storefront/product/RecordView";
import { ProductStickyBar } from "@/components/storefront/product/ProductStickyBar";
import { Accordion } from "@/components/ui/Accordion";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/Section";
import {
  Calendar,
  CheckCircle,
  Clock,
  Headset,
  Refresh,
  Ruler,
  Shield,
  Truck,
} from "@/components/icons";
import {
  getCategories,
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/data/catalog";
import { BADGE_LABEL, type FulfilmentType } from "@/lib/types/catalog";

/** Priced from the database on every request — see the note in page.tsx. */
export const dynamic = "force-dynamic";

/** The full promise, spelled out — the card only has room for a chip. */
const PROMISE: Record<
  FulfilmentType,
  { Icon: typeof Clock; title: (d?: number) => string; body: string }
> = {
  instant: {
    Icon: Clock,
    title: () => "Delivered in 18 minutes",
    body: "In stock at your nearest Quoin store, inside the serviceable radius.",
  },
  scheduled: {
    Icon: Truck,
    title: (d) => `Delivered in about ${d ?? 2} days`,
    body: "Bulk item — dispatched from the regional warehouse on your chosen date.",
  },
  bookable: {
    Icon: Calendar,
    title: () => "Book a slot",
    body: "A verified Quoin expert attends your site at the time you choose.",
  },
  made_to_order: {
    Icon: Ruler,
    title: (d) => `Cut to order in about ${d ?? 7} days`,
    body: "Cut to your measurements after ordering. Not eligible for instant delivery.",
  },
};

/**
 * What Quoin commits to after the sale.
 *
 * Deliberately short and deliberately hedged where it must be: the
 * manufacturer warranty is the manufacturer's, and Quoin's part is
 * handling the claim. Promising "1 year warranty" on 3,000 imported SKUs
 * with no warranty field would be a promise made by a layout decision.
 */
const AFTER_SALE = [
  {
    Icon: Shield,
    title: "Manufacturer warranty",
    body: "Whatever the maker covers, covered. Quoin handles the claim on your behalf.",
  },
  {
    Icon: Refresh,
    title: "Returns",
    body: "Unopened and unfitted goods can be returned within 7 days. Cut-to-order items cannot.",
  },
  {
    Icon: Headset,
    title: "Help choosing",
    body: "A free video consultation with someone who has fitted this before.",
  },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Not found — Quoin" };
  return {
    title: `${product.title} — Quoin`,
    description: `${product.title}${product.brand ? ` by ${product.brand}` : ""} on Quoin.`,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [related, categories] = await Promise.all([
    getRelatedProducts(product),
    getCategories(),
  ]);

  const category = categories.find((c) => c.id === product.categoryId);
  const promise = PROMISE[product.fulfilment];

  return (
    <AppShell>
      {/* Renders nothing; records the view for the "where you left off"
          rail on the home page. */}
      <RecordView product={product} />

      <div className="pt-4 lg:pt-6">
        <div className="mb-4 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Categories", href: "/categories" },
              ...(category
                ? [{ label: category.title, href: `/c/${category.slug}` }]
                : []),
              { label: product.title },
            ]}
          />
        </div>

        {/* Single column on a phone; gallery and buy box side by side once
            there is room for both to be read without scrolling. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12">
          <Gallery product={product} />

          <div className="px-5 lg:px-0">
            <div className="pt-6 lg:pt-0">
              {product.brand && (
                <Link
                  href={`/products?brand=${slugifyBrand(product.brand)}`}
                  className="text-micro font-semibold uppercase tracking-wide text-accent transition-colors hover:text-accent-bright"
                >
                  {product.brand}
                </Link>
              )}

              <h1 className="mt-2 text-title-lg font-semibold leading-tight text-ink lg:text-headline">
                {product.title}
              </h1>

              {product.badges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.badges.map((b) => (
                    <Badge key={b} tone="accent" icon={<CheckCircle className="size-3.5" />}>
                      {BADGE_LABEL[b]}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-5 flex items-start gap-3 rounded-card border border-line bg-surface p-4">
                <promise.Icon className="mt-0.5 size-5 shrink-0 text-accent" />
                <div>
                  <p className="text-body font-semibold text-ink">
                    {promise.title(product.leadTimeDays)}
                  </p>
                  <p className="mt-0.5 text-caption leading-snug text-muted">
                    {promise.body}
                  </p>
                </div>
              </div>

              {/* `id` is the sticky bar's scroll target for products
                  whose options must be chosen before adding. */}
              <div id="buy" className="mt-6 scroll-mt-24">
                <PurchasePanel product={product} />
              </div>
            </div>
          </div>
        </div>

        {/* Everything below the fold, in the order a buyer needs it:
            what it is, then what Quoin does after they have bought it,
            then what else is in the same aisle. */}
        <div className="mt-14 space-y-12 lg:mt-20 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12 lg:space-y-0">
          <div className="space-y-3 lg:space-y-12">
            {/* Accordions on a phone, open sections on a desktop.

                Collapsed blocks are right where vertical space is the
                scarce resource and wrong where it is not: on a 1440px
                screen a customer comparing two products should not have to
                open the same panel twice. `defaultOpen` is set from the
                breakpoint the page is built for, and the `<details>` is
                simply forced open by CSS from `lg` up. */}
            <section className="lg:hidden">
              <div className="px-5">
                <Accordion title="Specifications" defaultOpen>
                  <Specs product={product} categoryTitle={category?.title} />
                </Accordion>
              </div>
            </section>

            <section className="hidden lg:block">
              <SectionHead level={2} title="Specifications" size="sm" />
              <div className="px-5 lg:px-0">
                <Specs product={product} categoryTitle={category?.title} />
              </div>
            </section>

            <section>
              <SectionHead
                level={2}
                title="Reviews"
                size="sm"
                className="hidden lg:flex"
              />
              <div className="px-5 lg:px-0">
                {/* No review table exists. An invented 4.6 from 213
                    ratings would be the most damaging thing on the page:
                    every other number here is real, and one fabricated
                    one makes the rest suspect. */}
                <EmptyState
                  compact
                  title="No reviews yet"
                  action={{ href: "/consult", label: "Ask an expert instead" }}
                >
                  Reviews open once orders for this product have been
                  delivered. Until then, a free consultation is the fastest
                  way to hear from someone who has fitted one.
                </EmptyState>
              </div>
            </section>
          </div>

          <aside className="px-5 lg:px-0">
            <h2 className="mb-3 text-title-sm font-semibold text-ink">
              After you buy
            </h2>
            <ul className="space-y-3">
              {AFTER_SALE.map(({ Icon, title, body }) => (
                <li
                  key={title}
                  className="flex gap-3 rounded-card border border-line-soft bg-surface p-4"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold text-ink">{title}</p>
                    <p className="mt-0.5 text-caption leading-relaxed text-muted">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <ProductStickyBar product={product} />

        {related.length > 0 && (
          <section className="mt-16">
            <SectionHead
              title="Goes well with"
              subtitle={
                category ? `More from ${category.title}` : undefined
              }
              href={category ? `/c/${category.slug}` : "/products"}
            />
            <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-5">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

/**
 * The brand link.
 *
 * `Product.brand` is a display name, not a slug — the catalogue's brand
 * row holds both but only the name reaches the storefront type. Rather
 * than widen the domain model for one link, the name is slugified the same
 * way the importer does, which is exact for every brand in the catalogue
 * today. If that ever stops being true, the listing simply returns
 * everything, which is a harmless failure.
 */
function slugifyBrand(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
