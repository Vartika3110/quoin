import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { TabRail } from "@/components/storefront/TabRail";
import {
  BrandStrip,
  CategoryCards,
  ConsultCta,
  EntryTiles,
  Hero,
  ProBanner,
  TrustBar,
} from "@/components/storefront/home";
import { SectionHead, WideLink } from "@/components/storefront/sections";
import {
  getCategories,
  getCategoryPriceFloors,
  getFeaturedBrands,
  getTabs,
  getTopPicks,
} from "@/lib/data/catalog";

/**
 * Rendered per request.
 *
 * The catalogue lives in Postgres, and a static prerender would run those
 * queries during `next build`, where the database is deliberately not
 * reachable — `env.ts` skips validation in the build phase because hosts
 * inject `DATABASE_URL` at runtime. It would also mean rebuilding the site
 * to correct a price. Once the traffic justifies it, this becomes `use
 * cache` with a short `cacheLife` rather than a build-time prerender.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [tabs, categories, picks, priceFloors, brands] = await Promise.all([
    getTabs(),
    getCategories(),
    getTopPicks(),
    getCategoryPriceFloors(),
    /* Eight is what fits the desktop rail without scrolling, and a brand
       nobody scrolls to is not on the page. The rest are one tap away
       under the section's own "See all". */
    getFeaturedBrands(8),
  ]);

  /* Four tiles is the row the design is built around; the rest of the
     catalogue is one tap away under the section's own "See all". */
  const featured = categories.slice(0, 4);

  return (
    <AppShell>
      <div className="space-y-8 pt-4 lg:space-y-10 lg:pt-0">
        <EntryTiles />

        <div className="px-5 lg:px-0">
          <ConsultCta />
        </div>

        <TabRail tabs={tabs} />

        <section aria-label="Featured" className="px-5 lg:px-0">
          <Hero />
        </section>

        <section className="px-5 lg:px-0">
          <TrustBar />
        </section>

        <section>
          <SectionHead title="Shop by Category" href="/categories" />
          <CategoryCards categories={featured} priceFloors={priceFloors} />
        </section>

        <section>
          <SectionHead title="Project Essentials" href="/products" />
          {/* A grid at every width, two across on a phone — the same shape
              the browse pages use, so a pick here and the same product on
              /products are the same object rather than two. */}
          <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0 xl:grid-cols-5">
            {picks.map((p) => (
              <ProductCard key={p.id} product={p} fill />
            ))}
          </div>
          <div className="mt-3">
            <WideLink href="/products" label="See all products" icon="sparkle" />
          </div>
        </section>

        <section>
          <SectionHead title="Associated brands" href="/products" />
          <BrandStrip brands={brands} />
        </section>

        <ProBanner cartCount={8} />
      </div>
    </AppShell>
  );
}
