import { cookies } from "next/headers";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { CategoryTile, CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import { Hero } from "@/components/storefront/home/Hero";
import { BannerCarousel } from "@/components/storefront/home/BannerCarousel";
import { EntryCards } from "@/components/storefront/home/EntryCards";
import { CatalogTabs } from "@/components/storefront/home/CatalogTabs";
import { QuickActions } from "@/components/storefront/home/QuickActions";
import { Rooms } from "@/components/storefront/home/Rooms";
import { CategoryRail } from "@/components/storefront/home/CategoryRail";
import { CategoryCards } from "@/components/storefront/home/CategoryCards";
import { ProAndCart } from "@/components/storefront/home/ProAndCart";
import { RecentlyViewed } from "@/components/storefront/home/RecentlyViewed";
import { TrustBar, TrustStrip } from "@/components/storefront/home/TrustBar";
import { ServicesRow } from "@/components/storefront/home/ServicesRow";
import { BrandRail, BrandWall } from "@/components/storefront/home/BrandWall";
import {
  FinalCta,
  ParchaPromo,
  ProjectHubPromo,
  ProPromo,
} from "@/components/storefront/home/Promos";
import { Gutter, PageSections, SectionHead } from "@/components/ui/Section";
import {
  getCategories,
  getCategoryPriceFloors,
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
 * The home page's order is an argument about what Quoin is, and it is a
 * different argument on a phone than on a desktop.
 *
 * **On a desktop** the hero comes first and alone — one composition, and
 * the only sentence on the site that says what this company does.
 *
 * **On a phone** it follows the reference design, which is a launcher
 * rather than a landing page: four entry cards and a six-icon rail put
 * every part of the business one tap away above the fold, and the banner
 * carousel does the selling underneath them. That ordering assumes a
 * returning customer with a job to do, which is who opens a materials app
 * on a site, and it is why the entry cards are handed to the header
 * rather than rendered here — in the design they sit above search.
 *
 * From there both widths agree: proof, the brands, the catalogue, then
 * the two products — Project Hub and Pro — that make it more than a shop.
 */
export default async function HomePage() {
  const [categories, picks, priceFloors, services, deals, chosen] =
    await Promise.all([
      getCategories(),
      getTopPicks(),
      getCategoryPriceFloors(),
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
    <AppShell fullBleed headerSlot={<EntryCards />}>
      <div className="mx-auto w-full max-w-shell lg:px-6">
        <PageSections>
          {/* Two first screens, one at a time. The rail and the carousel
              are the reference design's, sized for a thumb; the editorial
              hero is what a 1440px page wants and would be a full screen
              of type before the first product on a phone.

              The rail and the banner are one block rather than two page
              sections — the rail reads as a caption on the banner, and
              `PageSections`' 40px between them would say they are two
              unrelated things. */}
          <div className="space-y-5 lg:hidden">
            <CatalogTabs />
            <BannerCarousel />
          </div>

          <div className="hidden lg:block">
            <Hero chosen={chosen} />
          </div>

          {/* Reassurance immediately under the banner, where the design
              puts it, then the brands. Both were at the foot of the page
              and were doing nothing for anyone who never got there. */}
          <TrustStrip />

          <section>
            <SectionHead
              title="Top Brands"
              subtitle="Bought direct, priced from the manufacturer's own list."
              href="/products"
              linkLabel="View all"
            />
            <BrandRail />
            <Gutter>
              <BrandWall />
            </Gutter>
          </section>

          {/* The four *verbs*, below the fold. The entry cards above are
              the four places; this is the four things to do in them, and
              on a phone it is the row you scroll back to rather than the
              one you land on. */}
          <QuickActions />

          {/* Shop by Category and Shop by Department are the same data
              asked two different questions, which is why they are two
              sections and not one with a "see all".

              **Category** is four cards with a price floor on them —
              "can I start here for ₹380". **Department** is all fourteen
              as thumbnails — "do you stock this at all". The first is a
              decision, the second is an index, and a reader uses exactly
              one of them.

              From `lg` the first becomes six photographic tiles, where
              there is room for the picture to do the selling, and the
              second is dropped: the header's own category menu already
              lists all fourteen at that width. */}
          <section>
            <SectionHead
              title="Shop by Category"
              subtitle="Priced from the manufacturer's own list."
              href="/categories"
            />
            <CategoryCards
              categories={categories.slice(0, 4)}
              priceFloors={priceFloors}
            />
            <div className="hidden grid-cols-3 gap-3 lg:grid">
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
              title="Project Essentials"
              subtitle="Photographed lines from across the catalogue."
              href="/products"
              linkLabel="View all"
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

          {/* The index. Phone only — see the note on Shop by Category. */}
          <section className="lg:hidden">
            <SectionHead
              title="Shop by Department"
              subtitle={`All ${categories.length} departments.`}
              href="/categories"
              linkLabel="View all"
            />
            <CategoryRail categories={categories} />
          </section>

          {/* Pro and the basket share a row on a phone; from `lg` the Pro
              pitch gets the full-width band below and the basket is
              permanently in the header, so neither belongs here. */}
          <ProAndCart />

          <section>
            <SectionHead
              title="Plan by Room"
              subtitle="Start from the space you are working on."
              href="/categories"
              linkLabel="All departments"
            />
            <Rooms />
          </section>

          {deals.items.length > 0 && (
            <section>
              <SectionHead
                title="Under List Price"
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
              title="Expert Services"
              subtitle="Verified professionals, booked against a real slot."
              href="/services"
            />
            <ServicesRow services={services.slice(0, 4)} />
          </section>

          <Gutter>
            <ParchaPromo />
          </Gutter>

          {/* Phone gets the compact pair above instead — two Pro pitches
              on one page is one of them being ignored. */}
          <Gutter className="hidden lg:block">
            <ProPromo />
          </Gutter>

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
