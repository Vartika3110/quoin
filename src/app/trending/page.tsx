import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/Section";
import { Trend } from "@/components/icons";
import { getTrending } from "@/lib/data/trending";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending — Quoin",
  description:
    "The interior and exterior products moving fastest on Quoin right now, ranked from real orders and saves over the last 30 days.",
};

/**
 * What is actually moving.
 *
 * ## The one thing this page must not do
 *
 * Call something trending that is not. `getTrending` ranks a trailing
 * thirty days of real orders and real wishlist saves, and when there is
 * not enough of either to rank anything it returns the newest products
 * instead — in which case **this page retitles itself**. It is headed
 * "Trending now" only when there is a measurement behind the word; the
 * fallback is headed "New in interiors & exteriors", which is what it is.
 *
 * That carries the honesty on its own, which is why the explanatory
 * banner that used to sit under the heading is gone at the owner's
 * instruction: the heading and the standfirst already say which of the
 * two the reader is looking at, and a bordered paragraph repeating it was
 * the first thing on the page.
 *
 * It matters more here than on any other shelf. "Trending" is a claim
 * about the market, and a customer who learns that Quoin's trending page
 * is really its import log has learned something about every other number
 * on the site too. `getBestsellers` set this precedent by returning
 * nothing rather than padding itself; this page keeps it in the heading.
 *
 * Interiors and exteriors only, which is what the brief asks for — the
 * departments are listed in `TRENDING_DEPARTMENTS`, and nobody browses
 * trending cement.
 */
export default async function TrendingPage() {
  const { basis, items, windowDays } = await getTrending(24);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <SectionHead
          title={basis === "measured" ? "Trending now" : "New in interiors & exteriors"}
          subtitle={
            basis === "measured"
              ? `What Quoin's customers have been ordering and saving most over the last ${windowDays} days — interiors and exteriors.`
              : "The latest additions across interiors and exteriors."
          }
        />

        {items.length === 0 ? (
          <div className="px-5 lg:px-0">
            <EmptyState
              icon={<Trend className="size-6" />}
              title="Nothing to show yet"
              action={{ href: "/products", label: "Browse everything" }}
            >
              There is nothing sellable in the interiors and exteriors departments at the
              moment.
            </EmptyState>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0 xl:grid-cols-5">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} fill />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
