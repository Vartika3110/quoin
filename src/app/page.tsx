import { cookies } from "next/headers";
import { AppShell } from "@/components/storefront/AppShell";
import { JsonLd } from "@/components/analytics/JsonLd";
import { organizationSchema, webSiteSchema } from "@/lib/seo";
import { ProductCard } from "@/components/storefront/ProductCard";
import { CategoryTile, CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import { Hero } from "@/components/storefront/home/Hero";
import { EntryCards } from "@/components/storefront/home/EntryCards";
import { CategoryCards } from "@/components/storefront/home/CategoryCards";
import { ParchaLine } from "@/components/storefront/home/ParchaLine";
import { ProfessionalRail } from "@/components/storefront/home/ProfessionalRail";
import { ServiceIconRail } from "@/components/storefront/home/ServiceIconRail";
import { ServicesRow } from "@/components/storefront/home/ServicesRow";
import { StudioRow } from "@/components/storefront/home/StudioRow";
import { BrandRail, BrandWall } from "@/components/storefront/home/BrandWall";
import { PageSections, SectionHead, hasEnough } from "@/components/ui/Section";
import {
  getBestsellers,
  getCategories,
  getCategoryPriceFloors,
  getTopPicks,
  listProducts,
} from "@/lib/data/catalog";
import { PREMIUM_FLOOR_RUPEES } from "@/lib/browse-params";
import { listServices } from "@/lib/data/services";
import { listProfessionals } from "@/lib/data/professionals";
import { listTopRooms } from "@/lib/data/studio";
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
 * Three blocks: the hero, one catalogue block, and the brands.
 *
 * It was eighteen. What went was everything that repeated something the
 * reader could already reach — three separate ways to browse the
 * catalogue, two trust rows, a full-width pitch each for Project Hub,
 * Parcha and Pro, and a closing call to action under all of it. A
 * product's home page is not a landing page, and a reader who has
 * scrolled it has been handed somewhere to go six times already.
 *
 * **Expert services was the last to go**, at the owner's instruction. It
 * is not a weak proposition — it is half of what Quoin sells — but the
 * home page was not where anyone found it: Services has a card in
 * `EntryCards` at the very top of the phone screen, an entry in the
 * header, and a column in the footer, so a row of two service cards
 * two-thirds of the way down was the fourth offer of the same door.
 * `/services` is unchanged and still the real thing.
 *
 * The entry cards are handed to the header rather than rendered here —
 * in the reference design they sit above search, and that is the one
 * piece of navigation on the first screen.
 */
export default async function HomePage() {
  const [categories, priceFloors, picks, bestsellers, rooms, services, people, chosen] =
    await Promise.all([
      getCategories(),
      getCategoryPriceFloors(),
      getTopPicks(),
      getBestsellers(10),
      /* Six: five for the row and one spare, so a room that loses its
         photograph does not leave a gap. */
      listTopRooms(6),
      listServices(),
      listProfessionals(),
      cookies().then((c) => getAreaChoice(c.get(AREA_COOKIE)?.value)),
    ]);

  /* Architectural Selects, after the batch above rather than inside it.
     `getTopPicks` explains what a wide fan-out costs a pooled Postgres,
     and that batch is already seven deep. */
  /* Not `sort: "newest"`. The most recently imported premium products
     are an illustrated batch — the newest thirty contain no photographed
     product at all — so sorting by date fills the rail with nothing this
     row can use. By name is arbitrary but stable, and it reaches the
     photographed stock. */
  const selectsPage = await listProducts({
    minPricePaise: PREMIUM_FLOOR_RUPEES * 100,
    sort: "name",
    pageSize: 60,
  });

  /* Three product rails on one page can show the same thing three times.
     They cut the catalogue on different axes — a recent photographed line,
     a genuine bestseller, anything over ₹5,000 — and a product can satisfy
     all three, so each rail takes only what the ones above it did not. The
     photograph is deduplicated too: one family shares a picture across
     several sizes, so a row can repeat an image without repeating a
     product. */
  const shown = new Set([...picks, ...bestsellers].map((p) => p.id));
  const shownPhotos = new Set(
    [...picks, ...bestsellers].map((p) => p.photo).filter(Boolean),
  );
  const selects: typeof picks = [];
  for (const product of selectsPage.items) {
    if (selects.length === 10) break;
    if (!product.photo || product.photoIsIllustration) continue;
    if (shown.has(product.id) || shownPhotos.has(product.photo)) continue;
    shown.add(product.id);
    shownPhotos.add(product.photo);
    selects.push(product);
  }

  /* Eight, the same eight at both widths. Fourteen fits neither shape
     cleanly — four across leaves a last row of two, and on a phone it is
     seven rows of cards before the next section — so the page shows two
     full rows and sends the rest to `/categories`. The cut is
     alphabetical, which is worth knowing: the six left out start with
     later letters, they are not lesser departments. */
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
          {/* The first screen, and the only navigation on it.

              A phone used to open on three rows of links stacked on top
              of each other before any content: the entry cards, this
              catalogue rail, and the tab bar pinned at the bottom. All
              three went to the same handful of places — Services in two
              of them, Products and Studio in all three — so a reader's
              first scroll was the same four destinations offered three
              times in three visual languages.

              The rail is the one that went. The entry cards carry the
              same four doors with room to say what each one is, and the
              tab bar is permanent. What the rail had that neither does —
              Interiors and Lighting — are two categories out of fourteen,
              and the header's category menu holds all of them.

              The hero stacks on a phone and the photograph is on top, so
              a reader sees a finished building before they read a word
              about it. */}
          <Hero chosen={chosen} />

          {/* Straight under the hero, before the catalogue. Somebody
              arriving with a list in their hand should not have to scroll
              past eight departments to find out this site will read it —
              and somebody who has no list loses one row to it. */}
          <ParchaLine />

          {/* One categories block, not three.

              This page carried Shop by Category (four priced cards), Shop
              by Department (all fourteen as a rail) and Plan by Room
              (eight rooms) — the same catalogue asked three ways, in three
              different shapes, within one scroll. The header's category
              menu already holds the full index at every width, so the
              index is where it belongs and this is the decision: a few
              departments, with what it costs to start in each. */}
          <section>
            <SectionHead
              title="Shop by category"
              subtitle="Priced from the manufacturer's own list."
              href="/categories"
            />
            <CategoryCards categories={featured} priceFloors={priceFloors} />
            {/* Four across: two full rows of eight. The remaining six are
                behind the section's own "See all", and behind the
                header's category menu, which carries all fourteen at
                every width. */}
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

          {/* Photographed lines, one per department. The row is sold by
              its pictures, so `getTopPicks` takes nothing illustrated and
              comes back short rather than padded. */}
          {hasEnough(picks) && (
            <section>
              <SectionHead
                title="Project essentials"
                subtitle="Photographed lines from across the catalogue."
                href="/products"
                linkLabel="View all"
              />
              <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-5">
                {picks.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {/* A real count, not a curated row — see `getBestsellers`. It
              ranks units sold across orders where money moved, so on a
              catalogue that has taken few orders it returns few products
              and `hasEnough` drops the section. A bestsellers row filled
              from the catalogue would be a lie about the one thing it
              claims to measure. */}
          {hasEnough(bestsellers) && (
            <section>
              <SectionHead
                title="Bestsellers"
                subtitle="Ranked by what customers have actually ordered."
                href="/products"
                linkLabel="View all"
              />
              <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-5">
                {bestsellers.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {/* Rooms, not products. Studio is the part of this site that
              answers "what should it look like" rather than "what does it
              cost", and the home page should say it exists. */}
          {hasEnough(rooms) && (
            <section>
              <SectionHead
                title="Inspired by Studio"
                subtitle="Finished rooms, and what each one is made of."
                href="/studio"
                linkLabel="Open Studio"
              />
              <StudioRow rooms={rooms} />
            </section>
          )}

          {/* The same cut as /premium, from the same constant, so the rail
              and the page behind its "View all" are one listing. */}
          {hasEnough(selects) && (
            <section>
              <SectionHead
                title="Architectural Selects"
                subtitle="The upper end of the catalogue, from ₹5,000."
                href="/premium"
                linkLabel="View all"
              />
              <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-5">
                {selects.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {hasEnough(services) && (
            <section>
              <SectionHead
                title="Expert services"
                subtitle="Verified professionals, booked against a real slot."
                href="/services"
                linkLabel="View all"
              />
              {/* Every trade to choose from, then four read in full. */}
              <ServiceIconRail services={services} />
              {/* The roster the reference design asks for. Sample data
                  for now, labelled as such by the rail itself. */}
              {people.length > 0 && <ProfessionalRail people={people} />}
              <ServicesRow services={services.slice(0, 4)} />
            </section>
          )}

          {/* Brands last, because this is the one row on the page a reader
              arrives already knowing they want — somebody looking for
              Jaquar searches or filters, they do not scroll the home page
              for a logo. It is a shortcut for the return visit, not an
              introduction, so it sits where a shortcut belongs. */}
          <section>
            <SectionHead title="Shop by brand" href="/products" linkLabel="All brands" />
            {/* Two components, one row — and both are needed. `BrandRail`
                is `lg:hidden` (an auto-scrolling marquee, because fourteen
                marks wrapped at 375px is four rows of specks) and
                `BrandWall` is `hidden lg:block` (the wrapped wall, which
                only reads as a wall when there is width for it). Rendering
                the rail alone left the desktop page with this heading and
                nothing under it. */}
            <BrandRail />
            <BrandWall />
          </section>

        </PageSections>
      </div>
    </AppShell>
  );
}
