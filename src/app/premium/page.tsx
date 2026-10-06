import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Browse } from "@/components/storefront/browse/Browse";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/Section";
import { Crown } from "@/components/icons";
import { getProductFacets, listProducts } from "@/lib/data/catalog";
import { readBrowseParams, toProductQuery } from "@/lib/browse-request";
import { floorPrice } from "@/lib/browse-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Architectural Selects — Quoin",
  description:
    "The upper end of the catalogue: sanitaryware, fittings and appliances at ₹5,000 and above.",
};

/**
 * Architectural Selects (formerly Premium Studio).
 *
 * The home page has carried a **PREMIUM STUDIO · Bespoke products** tile
 * and the navigation a **Premium Products** entry since launch, and both
 * pointed at `/pro` — which is Quoin Pro, a trade *membership* page. A
 * customer tapping a tile that says "premium products" arrived at a
 * B2B subscription pitch for something else entirely, and one they could
 * not join either, since no membership fee exists. This page is what
 * those two entry points were always promising.
 *
 * `/pro` is untouched and stays what it is. The two are genuinely
 * different propositions — one is expensive goods, the other is cheaper
 * goods for people who buy constantly — and the only thing wrong before
 * was that one door opened onto the other.
 *
 * ## Why a price floor, and why ₹5,000
 *
 * Nothing in the schema says "premium". There is no curated flag, no
 * editor's pick, no `tier` column, and inventing one would mean somebody
 * hand-sorting three thousand products before this page could exist.
 *
 * Price is the one honest proxy already in the data, and ₹5,000 is the
 * prototype's own line — it drew Premium as Interiors & Decor plus
 * anything at or above ₹5,000. The Interiors half has no equivalent here
 * (this catalogue's fourteen departments are materials and fittings, and
 * interiors live in Studio), so the price half is what carries over. It
 * yields about a thousand products, most of them Jaquar's upper
 * sanitaryware, which is in fact the premium end of this catalogue.
 *
 * The floor **clamps rather than replaces** a customer's own price
 * filter — see `floorPrice`. Someone narrowing to "Above ₹10,000" inside
 * Premium keeps their filter; someone picking a band that starts below
 * ₹5,000 gets ₹5,000. So the filter panel stays fully usable and nothing
 * on this page can fall out of the listing it claims to be.
 *
 * When merchandising does curate a premium set, this becomes a query
 * against that column and the floor goes away. Until then the page is
 * honest about being a price cut, in the subtitle and here.
 */

/** The prototype's line, in rupees. See the note above. */
const PREMIUM_FLOOR_RUPEES = 5000;

export default async function PremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = readBrowseParams(await searchParams);

  /* The floor is applied to the query the same way it is applied to the
     grid's own fetch, so page 1 and page 2 are the same listing. */
  const min = floorPrice(params.min, PREMIUM_FLOOR_RUPEES);
  const query = {
    ...toProductQuery(params),
    minPricePaise: (min ?? PREMIUM_FLOOR_RUPEES) * 100,
  };

  const [result, facets] = await Promise.all([
    listProducts(query),
    getProductFacets(query),
  ]);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb
            items={[{ label: "Home", href: "/" }, { label: "Architectural Selects" }]}
          />
        </div>

        <SectionHead
          level={1}
          size="lg"
          title="Architectural Selects"
          /* Says what the shelf actually is. "Hand-picked by our design
             team" would be the natural line here and nobody has picked
             anything — the page is a price cut of the catalogue, and a
             customer who reads the subtitle knows exactly what they are
             looking at. */
          subtitle="The upper end of the catalogue — every product at ₹5,000 and above, priced from the manufacturer's own list."
        />

        {result.total === 0 ? (
          <div className="px-5 lg:px-0">
            <EmptyState
              icon={<Crown className="size-6" />}
              title="Nothing at this price yet"
              action={{ href: "/products", label: "Browse the catalogue" }}
              secondaryAction={{ href: "/pro", label: "See Quoin Pro" }}
            >
              No live product currently sits at ₹5,000 or above. This page
              fills itself from the catalogue, so it returns as soon as one
              does.
            </EmptyState>
          </div>
        ) : (
          <Browse
            page={result}
            facets={facets}
            basePath="/premium"
            params={params}
            /* Not a department, so the phone's department rail is omitted
               for the same reason Deals omits it: switching department
               from here would leave the listing the customer chose. */
            scope={{ minRupees: PREMIUM_FLOOR_RUPEES }}
          />
        )}
      </div>
    </AppShell>
  );
}
