import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/Section";
import { Rooted as RootedIcon } from "@/components/icons";
import { listRootedBrands, listRootedProducts } from "@/lib/data/indian-brands";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rooted — Indian brands on Quoin",
  description:
    "Indian manufacturers, and Quoin's own lines. Brands founded and headquartered in India, across materials, fittings, finishes and hardware.",
};

/**
 * Rooted: Indian brands, and Quoin's own.
 *
 * ## What the page claims, and how it is kept true
 *
 * One claim: every brand here is founded and headquartered in India.
 * `src/lib/data/indian-brands.ts` holds the list that makes that true and
 * explains why it is a reviewed list rather than a column — a brand's
 * nationality is a fact about a company, and the importer has no idea
 * where anything is from. A brand Quoin stocks that is on neither the
 * Indian nor the foreign list simply does not appear, which is the right
 * failure: a gap somebody fills, rather than a false claim on the one
 * page whose whole proposition is provenance.
 *
 * It deliberately does **not** claim these brands are better, cheaper or
 * more sustainable than the imported ones Quoin also sells. It says they
 * are Indian, in the standfirst, and nothing on the page says more than
 * that — which is why the banner spelling it out could go at the owner's
 * instruction without the page starting to overclaim. Anything more would
 * be a marketing line nobody can stand behind, and `/products` sells the
 * German hinges on the next page.
 *
 * ## Quoin's own lines are separated, not mixed in
 *
 * MARS is Indian and it is also ours, and those are two different things
 * to tell a customer. `BRAND_WALL` makes the same separation — "it is
 * ours, so it does not vouch for us" — so the house shelf is its own
 * section, labelled, above the rest.
 */
export default async function RootedPage() {
  const brands = await listRootedBrands();

  const house = brands.filter((brand) => brand.isHouseBrand);
  const independents = brands.filter((brand) => !brand.isHouseBrand);

  /* Two shelves, two queries, run in sequence rather than together: these
     are the heaviest reads on the page and `getTopPicks` records what a
     wide fan-out costs this deployment's connection pool. */
  const houseProducts = await listRootedProducts({
    brandSlugs: house.map((b) => b.slug),
    limit: 10,
  });
  const indianProducts = await listRootedProducts({
    brandSlugs: independents.map((b) => b.slug),
    limit: 20,
  });

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <SectionHead
          title="Rooted"
          subtitle="Indian manufacturers, and Quoin's own lines — across materials, fittings, finishes and hardware."
        />

        {brands.length === 0 ? (
          <div className="px-5 lg:px-0">
            <EmptyState
              icon={<RootedIcon className="size-6" />}
              title="No Indian brands are sellable right now"
              action={{ href: "/products", label: "Browse everything" }}
            >
              Quoin stocks Indian manufacturers, but none of them has live stock at the moment.
            </EmptyState>
          </div>
        ) : (
          <div className="space-y-10">
            {/* ---- The house lines ----------------------------------- */}
            {house.length > 0 && houseProducts.length > 0 && (
              <section>
                <SectionHead
                  title={house.length === 1 ? `${house[0].name} — Quoin's own` : "Quoin's own lines"}
                  subtitle="Made for Quoin and sold only here. Ours, so judge it on the product rather than on the badge."
                  size="sm"
                  level={3}
                />
                <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-5">
                  {houseProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            )}

            {/* ---- The brands themselves ----------------------------- */}
            <section>
              <SectionHead
                title="Indian brands we stock"
                subtitle="Deepest first. The number is live, sellable lines."
                size="sm"
                level={3}
              />
              <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0">
                {brands.map((brand) => (
                  <Link
                    key={brand.slug}
                    href={`/products?brand=${encodeURIComponent(brand.slug)}`}
                    className="flex flex-col justify-between rounded-card border border-line-soft bg-surface p-4 transition-colors hover:border-line-strong hover:bg-hover"
                  >
                    <span className="text-caption font-semibold text-ink">{brand.name}</span>
                    <span className="mt-2 flex items-baseline justify-between gap-2">
                      <span className="text-micro text-muted">
                        {brand.productCount.toLocaleString("en-IN")}{" "}
                        {brand.productCount === 1 ? "product" : "products"}
                      </span>
                      {brand.isHouseBrand && (
                        <span className="rounded-full bg-accent-wash px-2 py-0.5 text-micro font-medium text-accent">
                          Ours
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* ---- A wall of the products ---------------------------- */}
            {indianProducts.length > 0 && (
              <section>
                <SectionHead
                  title="From Indian makers"
                  href="/products"
                  linkLabel="All products"
                  size="sm"
                  level={3}
                />
                <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0 xl:grid-cols-5">
                  {indianProducts.map((product) => (
                    <ProductCard key={product.id} product={product} fill />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
