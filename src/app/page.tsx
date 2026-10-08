import { AppShell } from "@/components/storefront/AppShell";
import { JsonLd } from "@/components/analytics/JsonLd";
import { organizationSchema, webSiteSchema } from "@/lib/seo";
import { ProductCard } from "@/components/storefront/ProductCard";
import { CategoryTile, CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import { Hero } from "@/components/storefront/home/Hero";
import { EntryCards } from "@/components/storefront/home/EntryCards";
import { CategoryCards } from "@/components/storefront/home/CategoryCards";
import { WishlistRow } from "@/components/storefront/home/WishlistRow";
import { ProfessionalRail } from "@/components/storefront/home/ProfessionalRail";
import { ServiceIconRail } from "@/components/storefront/home/ServiceIconRail";
import { StudioRow } from "@/components/storefront/home/StudioRow";
import { DesignRenovate } from "@/components/storefront/home/DesignRenovate";
import { BrandRail, BrandWall } from "@/components/storefront/home/BrandWall";
import { PageSections, SectionHead, hasEnough } from "@/components/ui/Section";
import {
  getBestsellers,
  getCategories,
  getCategoryPriceFloors,
  getTopPicks,
  listProducts,
  listRailProducts,
} from "@/lib/data/catalog";
import { PREMIUM_FLOOR_RUPEES } from "@/lib/browse-params";
import { listServices } from "@/lib/data/services";
import { listProfessionals } from "@/lib/data/professionals";
import { listTopRooms } from "@/lib/data/studio";
import { formatPrice } from "@/lib/types/catalog";

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
 * Departments that get a rail of their own, in page order.
 *
 * Config rather than five copies of the same JSX: adding, renaming or
 * reordering one of these is a line here.
 *
 * **Not filtered to photographed products**, unlike the featured rows
 * above them. Only `bathware-plumbing` has photography — 1,339 products,
 * and none anywhere else in the catalogue — so a photo filter would make
 * every other department's rail empty. The reference design shows the
 * brand-initial swatch card in exactly these rows, and `ProductCard`
 * already falls back to it, so a department with no photography still
 * reads as a shelf rather than vanishing.
 *
 * The prototype's **Interiors & Decor** has no rail here because there is
 * no such department: this catalogue's fourteen are materials and
 * fittings. Interiors live in Studio, which has its own section above.
 */
/** How many of the roster the home page shows. The rest are behind the
    section's own "View all". */
const HOME_PROFESSIONALS = 8;

const CATEGORY_RAILS = [
  { slug: "bathware-plumbing", title: "Bathware & sanitary" },
  { slug: "tiling-adhesives", title: "Tiling & adhesives" },
] as const;

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
  /* **Three at a time, not seven.**
     `getTopPicks` records what a wide fan-out costs a pooled Postgres:
     every query held at once is a connection held at once, and enough of
     them exhausts the pool and times the page out — "which is how the
     home page started returning 500 in production". This page grew from
     four blocks to ten, and with it the burst grew back to seven
     simultaneous queries on top of the shell's own, against a pooler
     whose limit is 17. It started failing with P1001 and P2024.

     So the page asks in rounds. Each round is small enough to be safe and
     wide enough that the page is not simply serial; a round is only as
     slow as its slowest member, and these are indexed reads. Adding a
     section means adding it to a round, not widening one indefinitely —
     which is the mistake this comment exists to stop being repeated. */
  const [categories, priceFloors] = await Promise.all([
    getCategories(),
    getCategoryPriceFloors(),
  ]);

  const [picks, bestsellers] = await Promise.all([
    getTopPicks(),
    getBestsellers(10),
  ]);

  const [rooms, services, people] = await Promise.all([
    /* Six: five for the row and one spare, so a room that loses its
       photograph does not leave a gap. */
    listTopRooms(6),
    listServices(),
    listProfessionals(),
  ]);

  /* Architectural Selects, in a round of its own. */
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

  /* One query for every department shelf, not one per shelf — see
     `listRailProducts`. Eight `listProducts` calls fired together is the
     fan-out that took this page down once already. */
  /* The departments *without* a shelf, which is what the catch-all row
     at the foot of the page is for. Asked for by name rather than taken
     from a wide page of everything: sorted across the whole catalogue,
     the first few hundred products by name are mostly bathware — 1,595
     of 2,513 sellable lines — so filtering a general page left this row
     with nothing and it disappeared. */
  const railedSlugs = CATEGORY_RAILS.map((rail) => rail.slug);
  const otherSlugs = categories
    .map((c) => c.slug)
    .filter((slug) => !railedSlugs.includes(slug as (typeof railedSlugs)[number]));

  /* Two calls, four queries — each `listRailProducts` is a window
     function and a hydrate. Sequential, because they are the heaviest
     reads on the page and the round above has only just let go of its
     connections. */
  const railProducts = await listRailProducts(railedSlugs, 12);
  const otherProducts = await listRailProducts(otherSlugs, 4);

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

  /* The department rails take what the featured rows did not, and feed
     the same set forward — otherwise "More to explore" opens with the
     twelve products the reader just scrolled past. */
  const railSections = CATEGORY_RAILS.map((rail) => {
    const items = (railProducts.get(rail.slug) ?? [])
      .filter((p) => !shown.has(p.id))
      .slice(0, 10);
    items.forEach((p) => shown.add(p.id));
    return { ...rail, items };
  });

  /* Round-robin across the departments with no shelf of their own, not
     all of one then all of the next. Flattening the map grouped them, so
     a grid of twenty-four opened with four tools, then four paints — which
     reads as four more shelves with the headings taken off rather than as
     a mixed shelf. Taking one from each in turn is what makes "picked
     across every category" true of the first screen, not just the whole.

     Twelve, which is six rows two-up on a phone. Twenty-four was twelve
     rows and turned the foot of the page into a listing; this row is an
     invitation to keep browsing, and `/products` is where the listing
     actually lives. */
  const pools = [...otherProducts.values()].map((list) =>
    list.filter((p) => !shown.has(p.id)),
  );
  const MORE_TO_EXPLORE = 12;
  const more: typeof picks = [];
  for (let depth = 0; more.length < MORE_TO_EXPLORE; depth += 1) {
    const before = more.length;
    for (const pool of pools) {
      if (more.length === MORE_TO_EXPLORE) break;
      const product = pool[depth];
      if (product) more.push(product);
    }
    /* Every pool exhausted — stop rather than spin. */
    if (more.length === before) break;
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
          <Hero />


          {/* Before the catalogue, because it is not the catalogue: these
              are decisions the reader has already made, and somebody who
              has made one is likelier to be here to act on it than to
              start again. Renders nothing when the list is empty, which
              is most visits — see `WishlistRow`. */}
          <WishlistRow />

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
                href="/studio"
                linkLabel="Open Studio"
              />
              <StudioRow rooms={rooms} />
            </section>
          )}

          {/* The whole job, in one band: after the rooms, because "show me
              what it could look like" and "do all of it for me" are the
              same wish at two sizes. Needs three rooms for its collage and
              draws nothing without them. */}
          {rooms.length >= 3 && <DesignRenovate rooms={rooms.slice(0, 3)} />}

          {/* The same cut as /premium, from the same constant, so the rail
              and the page behind its "View all" are one listing. */}
          {hasEnough(selects) && (
            <section>
              <SectionHead
                title="Architectural Selects"
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
                href="/services"
                linkLabel="View all"
              />
              {/* Every trade to choose from, then the people who do it.

                  The four `ServiceCard`s that used to close this section
                  are gone at the owner's instruction. They were the long
                  form — pricing basis, timeline, what is included — of
                  four of the ten trades named in the row above, so the
                  section asked the reader to choose twice: once from
                  icons, then again from cards covering less than half the
                  same list. The detail is still on each service's own
                  page, which is where somebody who has chosen one is
                  going anyway. */}
              <ServiceIconRail services={services} />
              {/* Eight, not all thirty. On a phone the rest were behind a
                  swipe and cost nothing, but from `lg` the rail becomes a
                  grid and thirty people is ten rows — one home-page
                  section taller than the rest of the page put together.
                  The roster is not the home page's job; "View all" leads
                  to it. */}
              {people.length > 0 && (
                <ProfessionalRail people={people.slice(0, HOME_PROFESSIONALS)} />
              )}
            </section>
          )}

          {/* One rail per department, then everything else. These sit
              after the people and before the brands: a reader who has not
              been caught by anything above is browsing rather than
              looking, and a shelf is what browsing wants. */}
          {railSections.map((rail) =>
            hasEnough(rail.items) ? (
              <section key={rail.slug}>
                <SectionHead
                  title={rail.title}
                  href={`/c/${rail.slug}`}
                  linkLabel="View all"
                />
                <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-5">
                  {rail.items.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            ) : null,
          )}

          {hasEnough(more) && (
            <section>
              <SectionHead
                title="More to explore"
                href="/products"
                linkLabel="View all"
              />
              {/* A grid, not a rail — the one row on this page that is
                  meant to be scrolled *down*. Every shelf above it is a
                  horizontal rail, which is right for a department a reader
                  is sampling; this is the end of the page, where somebody
                  still looking wants a wall to read rather than another
                  thing to swipe. Two across on a phone, so twelve
                  products is six rows. */}
              <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0 xl:grid-cols-5">
                {more.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
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
