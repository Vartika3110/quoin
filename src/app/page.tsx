import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { TabRail } from "@/components/storefront/TabRail";
import {
  BannerRail,
  CategoryGrid,
  ProAndCart,
  SectionHead,
  WideLink,
} from "@/components/storefront/sections";
import {
  getBanners,
  getCategories,
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
  const [tabs, banners, categories, picks] = await Promise.all([
    getTabs(),
    getBanners(),
    getCategories(),
    getTopPicks(),
  ]);

  return (
    <AppShell>
      <div className="space-y-8 pt-4 lg:space-y-10 lg:pt-0">
        <TabRail tabs={tabs} />

        <section aria-label="Featured">
          <BannerRail banners={banners} />
        </section>

        <section>
          <SectionHead title="Shop by Category" href="/categories" />
          <CategoryGrid categories={categories} />
          <div className="mt-3">
            <WideLink href="/categories" label="See all categories" />
          </div>
        </section>

        <section>
          <SectionHead title="Top Picks for You" href="/products" />
          {/* Mobile scrolls horizontally like the reference; desktop breaks
              into a real grid rather than hiding product behind a swipe. */}
          <div className="rail gap-3 px-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 xl:grid-cols-5">
            {picks.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-3">
            <WideLink href="/products" label="See all products" icon="sparkle" />
          </div>
        </section>

        <ProAndCart cartCount={8} />
      </div>
    </AppShell>
  );
}
