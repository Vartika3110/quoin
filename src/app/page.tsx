import { cookies } from "next/headers";
import { AppShell } from "@/components/storefront/AppShell";
import { JsonLd } from "@/components/analytics/JsonLd";
import { organizationSchema, webSiteSchema } from "@/lib/seo";
import { ProductCard } from "@/components/storefront/ProductCard";
import { CategoryTile, CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import { Hero } from "@/components/storefront/home/Hero";
import { EntryCards } from "@/components/storefront/home/EntryCards";
import { CatalogTabs } from "@/components/storefront/home/CatalogTabs";
import { QuickActions } from "@/components/storefront/home/QuickActions";
import { CategoryCards } from "@/components/storefront/home/CategoryCards";
import { RecentlyViewed } from "@/components/storefront/home/RecentlyViewed";
import { TrustBar } from "@/components/storefront/home/TrustBar";
import { ServicesRow } from "@/components/storefront/home/ServicesRow";
import { BrandRail } from "@/components/storefront/home/BrandWall";
import { DesignRenovate } from "@/components/storefront/home/DesignRenovate";
import { Gutter, PageSections, SectionHead, hasEnough } from "@/components/ui/Section";
import {
  getCategories,
  getCategoryPriceFloors,
  getTopPicks,
  listProducts,
} from "@/lib/data/catalog";
import { PREMIUM_FLOOR_RUPEES } from "@/lib/browse-params";
import { listServices } from "@/lib/data/services";
import { listTopRooms } from "@/lib/data/studio";
import { formatPrice } from "@/lib/types/catalog";
import {
  AREA_COOKIE,
  getAreaChoice,
  listServiceAreas,
} from "@/lib/data/service-areas";

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
  const [categories, picks, priceFloors, services, rooms, chosen, serviceAreas] =
    await Promise.all([
      getCategories(),
      getTopPicks(),
      getCategoryPriceFloors(),
      listServices(),
      /* Three: the Design & Renovate band's collage. */
      listTopRooms(3),
      cookies().then((c) => getAreaChoice(c.get(AREA_COOKIE)?.value)),
      /* Named on the first screen rather than left to a pincode box on
         a product page somebody may never reach — see `Hero`. */
      listServiceAreas(),
    ]);

  /* Two more product rails, from one query each and after the batch above
     rather than inside it — `getTopPicks` explains what a wide fan-out
     costs a pooled Postgres, and the first batch is already seven deep.

     Photographed products only, for the reason `getTopPicks` gives, and
     nothing already on the Project essentials row. Either rail comes back
     short or empty rather than padded; `hasEnough` then drops it. */
  const [selectsPage, arrivalsPage] = await Promise.all([
    listProducts({
      minPricePaise: PREMIUM_FLOOR_RUPEES * 100,
      sort: "newest",
      pageSize: 30,
    }),
    listProducts({ sort: "newest", pageSize: 30 }),
  ]);
  const shown = new Set(picks.map((p) => p.id));
  const takePhotographed = (items: typeof picks, limit: number) => {
    const out: typeof picks = [];
    const photos = new Set<string>();
    for (const product of items) {
      if (out.length === limit) break;
      if (!product.photo || product.photoIsIllustration) continue;
      if (shown.has(product.id) || photos.has(product.photo)) continue;
      photos.add(product.photo);
      out.push(product);
    }
    out.forEach((p) => shown.add(p.id));
    return out;
  };
  const selects = takePhotographed(selectsPage.items, 10);
  const arrivals = takePhotographed(arrivalsPage.items, 10);

  /* Eight tiles: two full rows of four. Four across is what the brief
     asks for and what the rest of this page is built on — the quick
     actions, the services row and the entry cards are all fours, and a
     three-across band in the middle of them reads as a different page.
     The rest are behind the section's own "See all". */
  const featured = categories.slice(0, 8);

  return (
    <AppShell fullBleed headerSlot={<EntryCards />}>
      {/* Site-wide identity, emitted once and only here. Repeating
          Organization on every page is noise a crawler has to de-
          duplicate; the home page is the canonical place for it. */}
      <JsonLd data={organizationSchema()} />
      <JsonLd data={webSiteSchema()} />

      <div className="mx-auto w-full max-w-shell lg:px-6">
        <PageSections>
          {/* One first screen at every width.

              There used to be two: an editorial hero from `lg`, and a
              rail plus a three-slide banner carousel on a phone. The
              carousel is gone. It carried the scaffolding artwork this
              page is not supposed to lead with, it said "Sorted in
              Minutes" over a photograph of a building site, and two
              different first screens meant two different answers to what
              Quoin is — the one question the top of a home page exists to
              settle.

              The hero stacks on a phone and the photograph is on top, so
              a reader sees a finished room before they read a word about
              it. The rail stays above it: it is a filter on the
              catalogue, not a banner, and it belongs where a thumb starts.

              `space-y-5` rather than a page section between them — the
              rail reads as part of the same block, and `PageSections`'
              40px would say they are two unrelated things. */}
          <div className="space-y-5">
            <div className="lg:hidden">
              <CatalogTabs />
            </div>
            <Hero chosen={chosen} areas={serviceAreas.map((a) => a.name)} />
          </div>

          {/* The four verbs. The entry cards in the header slot are the
              four *places*; this is the four things to do in them, and it
              is the first thing under the hero because it is the answer
              to "what can I do here". */}
          <QuickActions />

          {/* One categories block, not three.

              This page carried Shop by Category (four priced cards), Shop
              by Department (all fourteen as a rail) and Plan by Room
              (eight rooms) — the same catalogue asked three ways, in three
              different shapes, within one scroll. A reader used one of
              them and paid attention past the other two. The header's
              category menu already holds the full index at every width,
              so the index is where it belongs and this is the decision:
              a few departments, with what it costs to start in each. */}
          <section>
            <SectionHead
              title="Shop by category"
              subtitle="Priced from the manufacturer's own list."
              href="/categories"
            />
            <CategoryCards
              categories={categories.slice(0, 4)}
              priceFloors={priceFloors}
            />
            <div className="hidden grid-cols-4 gap-3 lg:grid">
              {featured.map((category, i) => {
                const floor = priceFloors.get(category.id);
                return (
                  <CategoryTile
                    key={category.id}
                    category={category}
                    fill
                    ratio="landscape"
                    priority={i < 4}
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

          {/* Brands are navigation in this trade, not decoration — people
              arrive wanting Jaquar or UltraTech by name. The rail stays
              and the logo wall under it does not: two components for one
              row of marks, the second of which was a grid of logos with
              nothing to click through to that the rail does not already
              reach. */}
          <section>
            <SectionHead title="Shop by brand" href="/products" linkLabel="All brands" />
            <BrandRail />
          </section>

          {/* Where you were. Client-rendered and renders nothing at all on
              a first visit, which is why it sits this high: on a return
              visit it is the most useful thing on the page, and on a
              first visit it costs nothing. */}
          <RecentlyViewed />

          {hasEnough(picks) && (
            <section>
              <SectionHead
                title="Project essentials"
                subtitle="Photographed lines from across the catalogue."
                href="/products"
                linkLabel="View all"
              />
              <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-6">
                {picks.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {hasEnough(selects) && (
            <section>
              <SectionHead
                title="Architectural Selects"
                subtitle="The upper end of the catalogue, from ₹5,000."
                href="/premium"
                linkLabel="View all"
              />
              <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-6">
                {selects.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHead
              title="Expert services"
              subtitle="Verified professionals, booked against a real slot."
              href="/services"
            />
            <ServicesRow services={services.slice(0, 4)} />
          </section>

          {/* The whole job, in one band. After the single trades above it,
              because "an electrician" and "your whole home" are the same
              question asked at two sizes, and a reader who has just seen
              the first is ready for the second. */}
          <DesignRenovate rooms={rooms} />

          {hasEnough(arrivals) && (
            <section>
              <SectionHead
                title="New arrivals"
                subtitle="The newest photographed lines in the catalogue."
                href="/products?sort=newest"
                linkLabel="View all"
              />
              <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-6">
                {arrivals.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {/* One trust block, at the end.

              There were two — a strip under the hero and this bar at the
              foot — saying the same four things twice on one scroll. The
              strip went: reassurance belongs where a reader has seen
              enough to want it, not between the headline and the first
              thing to do.

              Everything else that stood here was a promotion. Project Hub,
              Parcha and Pro each had a full-width pitch, Pro had two, and
              a "final CTA" closed the page — five blocks selling four
              destinations that `QuickActions` and the header already link
              to. A product's home page is not a landing page, and a
              reader who has scrolled this far has been given somewhere to
              go six times already. */}
          <Gutter>
            <TrustBar />
          </Gutter>

        </PageSections>
      </div>
    </AppShell>
  );
}
