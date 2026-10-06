import { cookies } from "next/headers";
import { AppShell } from "@/components/storefront/AppShell";
import { JsonLd } from "@/components/analytics/JsonLd";
import { organizationSchema, webSiteSchema } from "@/lib/seo";
import { CategoryTile, CATEGORY_DESCRIPTOR } from "@/components/storefront/CategoryTile";
import { Hero } from "@/components/storefront/home/Hero";
import { EntryCards } from "@/components/storefront/home/EntryCards";
import { CategoryCards } from "@/components/storefront/home/CategoryCards";
import { ParchaLine } from "@/components/storefront/home/ParchaLine";
import { BrandRail, BrandWall } from "@/components/storefront/home/BrandWall";
import { PageSections, SectionHead } from "@/components/ui/Section";
import {
  getCategories,
  getCategoryPriceFloors,
} from "@/lib/data/catalog";
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
  const [categories, priceFloors, chosen] = await Promise.all([
    getCategories(),
    getCategoryPriceFloors(),
    cookies().then((c) => getAreaChoice(c.get(AREA_COOKIE)?.value)),
  ]);

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
