import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { PurchasePanel } from "@/components/storefront/PurchasePanel";
import { SectionHead } from "@/components/storefront/sections";
import { Swatch } from "@/components/Swatch";
import { Back, Calendar, Clock, Heart, Ruler, Shield, Truck } from "@/components/icons";
import {
  getAllProductSlugs,
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/data/catalog";
import { BADGE_LABEL, type FulfilmentType } from "@/lib/types/catalog";

/** The full promise, spelled out — the card only has room for a chip. */
const PROMISE: Record<
  FulfilmentType,
  { Icon: typeof Clock; title: (d?: number) => string; body: string }
> = {
  instant: {
    Icon: Clock,
    title: () => "Delivered in 18 minutes",
    body: "In stock at your nearest Quoin store, 1.1 km away.",
  },
  scheduled: {
    Icon: Truck,
    title: (d) => `Delivered in ${d ?? 2} days`,
    body: "Bulk item — dispatched from the regional warehouse on your chosen date.",
  },
  bookable: {
    Icon: Calendar,
    title: () => "Book a slot",
    body: "A verified Quoin expert visits your site at the time you choose.",
  },
  made_to_order: {
    Icon: Ruler,
    title: (d) => `Cut to order in ${d ?? 7} days`,
    body: "Cut to your measurements after ordering. Not eligible for instant delivery.",
  },
};

export async function generateStaticParams() {
  const slugs = await getAllProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

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

  const related = await getRelatedProducts(product);
  const promise = PROMISE[product.fulfilment];

  return (
    <AppShell>
      <div className="lg:pt-2">
        <div className="px-5 pt-3 lg:px-0 lg:pt-0">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
          >
            <Back className="size-4" />
            Back
          </Link>
        </div>

        {/* Single column on mobile; gallery and buy box side by side once
            there is room for both to be read without scrolling. */}
        <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
          <div>
            <div className="relative aspect-square overflow-hidden bg-raised lg:rounded-card">
              <Swatch
                swatchKey={product.image}
                label={product.title}
                className="size-full"
              />
              <button
                aria-label={`Save ${product.title}`}
                className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/45 text-ink backdrop-blur-sm hover:text-gold"
              >
                <Heart className="size-5" />
              </button>
            </div>
          </div>

          <div className="px-5 lg:px-0">
            <div className="pt-5 lg:pt-0">
              {product.brand && (
                <p className="text-xs uppercase tracking-wide text-gold">
                  {product.brand}
                </p>
              )}
              <h1 className="mt-1 text-2xl font-semibold leading-tight text-ink">
                {product.title}
              </h1>

              {product.badges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.badges.map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center gap-1.5 rounded-md bg-gold-wash px-2 py-1 text-[11px] text-gold"
                    >
                      <Shield className="size-3.5" />
                      {BADGE_LABEL[b]}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 flex items-start gap-3 rounded-card border border-line bg-surface p-4">
                <promise.Icon className="mt-0.5 size-5 shrink-0 text-gold" />
                <div>
                  <p className="text-sm font-medium text-ink">
                    {promise.title(product.leadTimeDays)}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted">
                    {promise.body}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <PurchasePanel product={product} />
              </div>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-12">
            <SectionHead title="Goes well with" />
            <div className="rail gap-3 px-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 xl:grid-cols-5">
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
