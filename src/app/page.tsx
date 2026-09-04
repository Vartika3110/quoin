import { cookies } from "next/headers";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { CategoryTile, CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import { Hero } from "@/components/storefront/home/Hero";
import { QuickActions } from "@/components/storefront/home/QuickActions";
import { Rooms } from "@/components/storefront/home/Rooms";
import { CategoryRail } from "@/components/storefront/home/CategoryRail";
import { RecentlyViewed } from "@/components/storefront/home/RecentlyViewed";
import { TrustBar } from "@/components/storefront/home/TrustBar";
import { ServicesRow } from "@/components/storefront/home/ServicesRow";
import {
  BrandStrip,
  FinalCta,
  ParchaPromo,
  ProjectHubPromo,
  ProPromo,
} from "@/components/storefront/home/Promos";
import { Gutter, PageSections, SectionHead } from "@/components/ui/Section";
import {
  getCategories,
  getCategoryPriceFloors,
  getFeaturedBrands,
  getTopPicks,
  listDiscountedProducts,
} from "@/lib/data/catalog";
import { listServices } from "@/lib/data/services";
import { formatPrice } from "@/lib/types/catalog";
import { AREA_COOKIE, getAreaChoice } from "@/lib/data/service-areas";

/**
 * Rendered per request.
 *
 * The catalogue lives in Postgres, and a static prerender would run these
 * queries during `next build`, where the database is deliberately not
 * reachable — `env.ts` skips validation in the build phase because hosts
 * inject `DATABASE_URL` at runtime. It would also mean rebuilding the site
 * to correct a price. Once the traffic justifies it, this becomes `use
 * cache` with a short `cacheLife` rather than a build-time prerender.
 */
export const dynamic = "force-dynamic";

/**
 * The home page's order is an argument about what Quoin is.
 *
 * Hero first, and alone: the previous version put four entry tiles and a
 * six-icon rail above the headline, so the only sentence that says what
 * this company does arrived third. Then the four things people came to do,
 * then the catalogue, then the two products — Project Hub and Pro — that
 * make it more than a shop, then the proof.
 */
export default async function HomePage() {
  const [categories, picks, priceFloors, brands, services, deals, chosen] =
    await Promise.all([
      getCategories(),
      getTopPicks(),
      getCategoryPriceFloors(),
      /* Eight fits the desktop row without scrolling, and a brand nobody
         scrolls to is not on the page. The rest are one tap away. */
      getFeaturedBrands(8),
      listServices(),
      /* Only rendered if there is anything in it. Both catalogue imports
         set MRP equal to the sell price, so this is usually empty — and a
         "Deals for you" rail with nothing in it is worse than no rail. */
      listDiscountedProducts(1, 10),
      cookies().then((c) => getAreaChoice(c.get(AREA_COOKIE)?.value)),
    ]);

  /* Six tiles: a full row of three at `lg` twice over, and three across on
     a tablet. The rest are behind the section's own "See all". */
  const featured = categories.slice(0, 6);

  return (
    <AppShell fullBleed>
      <div className="mx-auto w-full max-w-shell lg:px-6">
        <PageSections>
          <Hero chosen={chosen} />

          <QuickActions />

          {/* Two genuinely different treatments of the same data.

              On a phone: every department as a 76px thumbnail in a
              two-row rail, reachable with a thumb and costing almost no
              vertical space. Six tall photographic tiles there would be
              three screens of scrolling before the first product.

              From `lg`: six tiles where the photograph does the selling
              and there is room for it to. */}
          <section className="lg:hidden">
            <SectionHead
              title="Shop by category"
              subtitle={`All ${categories.length} departments.`}
              href="/categories"
            />
            <CategoryRail categories={categories} />
          </section>

          <section className="hidden lg:block">
            <SectionHead
              title="Shop by category"
              subtitle="Fourteen departments, priced from manufacturer lists."
              href="/categories"
            />
            <div className="grid grid-cols-3 gap-3">
              {featured.map((category, i) => {
                const floor = priceFloors.get(category.id);
                return (
                  <CategoryTile
                    key={category.id}
                    category={category}
                    fill
                    /* The first row is above the fold on a desktop. */
                    priority={i < 3}
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
          </section>

          <section>
            <SectionHead
              title="Plan by room"
              subtitle="Start from the space you are working on."
              href="/categories"
              linkLabel="All departments"
            />
            <Rooms />
          </section>

          <section>
            <SectionHead
              title="Project essentials"
              subtitle="Photographed lines from across the catalogue."
              href="/products"
            />
            {/* A rail on a phone, a grid from `lg`.

                `.rail` is flex and its children refuse to shrink, so the
                cards carry their own width there; `lg:grid` overrides the
                display and `fill` is not passed, which is why the card's
                own `lg:w-auto` exists. */}
            <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-6">
              {picks.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>

          {deals.items.length > 0 && (
            <section>
              <SectionHead
                title="Under list price"
                subtitle="Everything currently selling below its manufacturer list."
                href="/deals"
              />
              <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-6">
                {deals.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {/* Client-rendered, and renders nothing on a first visit. */}
          <RecentlyViewed />

          <Gutter>
            <ProjectHubPromo />
          </Gutter>

          <section>
            <SectionHead
              title="Expert services"
              subtitle="Verified professionals, booked against a real slot."
              href="/services"
            />
            <ServicesRow services={services.slice(0, 4)} />
          </section>

          <Gutter>
            <ParchaPromo />
          </Gutter>

          <Gutter>
            <ProPromo />
          </Gutter>

          <section>
            <SectionHead title="Brands on Quoin" href="/products" linkLabel="Shop all" />
            <BrandStrip brands={brands} />
          </section>

          <Gutter>
            <TrustBar />
          </Gutter>

          <Gutter>
            <FinalCta />
          </Gutter>
        </PageSections>
      </div>
    </AppShell>
  );
}
