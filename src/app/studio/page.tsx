import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioChrome } from "@/components/storefront/studio/StudioChrome";
import { StudioFilters } from "@/components/storefront/studio/StudioFilters";
import { PinGrid } from "@/components/storefront/studio/PinGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { Camera, Sparkle } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { countFeed, listFacets, listFeed } from "@/lib/data/studio";
import { countFilters, readFilters, toQueryString } from "@/lib/studio/query";

export const metadata: Metadata = {
  title: "Studio — Quoin",
  description:
    "Finished rooms, and what each one is made of — priced from the Quoin catalogue, line by line.",
  alternates: { canonical: "/studio" },
  openGraph: {
    title: "Studio — Quoin",
    description: "Rooms people have actually built, and the materials behind them.",
    url: "/studio",
    type: "website",
  },
};

/**
 * Studio's front door.
 *
 * The filters are the URL and this page reads them, which is what makes
 * `/studio?room=kitchen&style=warm` a thing somebody can send to their
 * contractor. The first page of pins and the facets are fetched here and
 * handed to the client already rendered — fetching them from an effect
 * would mean the entire point of the page arrives one round trip late,
 * behind a skeleton, on every visit.
 *
 * Public. A signed-out visitor browses and filters; the save button sends
 * them to `/signin` with a `next` that brings them back.
 */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const filters = readFilters(params);

  const query = {
    tab: "new" as const,
    room: filters.room ?? undefined,
    styles: filters.styles,
    materials: filters.materials,
    q: filters.q ?? undefined,
  };

  const [feed, facets, total] = await Promise.all([
    listFeed(session?.userId ?? null, query),
    listFacets(),
    countFeed(query),
  ]);

  return (
    <StudioShell
      header={
        <StudioChrome subtitle="Finished rooms, and what each one is made of — priced from the catalogue, line by line." />
      }
    >
      <div className="flex flex-col gap-5">
        {/* The pills are the only navigation on a phone once the rail is
            gone, so the masthead's tab row is rendered here too, without
            the display heading the top bar already carries. */}
        <div className="lg:hidden">
          <StudioChrome title="Studio" />
        </div>

        <StudioFilters facets={facets} filters={filters} resultCount={total} />

        <PinGrid
          initial={feed.ideas}
          initialCursor={feed.nextCursor}
          queryString={toQueryString(filters, { tab: "new" })}
          label="Rooms"
          empty={
            countFilters(filters) > 0 || filters.q ? (
              <EmptyState
                icon={<Sparkle className="size-6" />}
                title="Nothing matches those filters"
                action={{ href: "/studio", label: "Clear filters" }}
                compact
              >
                Try removing one, or search for something else.
              </EmptyState>
            ) : (
              <EmptyState
                icon={<Camera className="size-6" />}
                title="No rooms here yet"
                action={{ href: "/studio/upload", label: "Add the first room" }}
                secondaryAction={{ href: "/products", label: "Browse the catalogue" }}
              >
                Studio shows finished rooms and prices what they are made of.
                Product and material photographs live in the shop — this wall is
                for rooms somebody has actually built.
              </EmptyState>
            )
          }
        />
      </div>
    </StudioShell>
  );
}
