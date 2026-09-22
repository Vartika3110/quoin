import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioChrome } from "@/components/storefront/studio/StudioChrome";
import { StudioSearch } from "@/components/storefront/studio/StudioSearch";
import { getSession } from "@/lib/auth/session";
import { countFeed, listFacets, listFeed } from "@/lib/data/studio";
import { readFilters } from "@/lib/studio/query";

export const metadata: Metadata = {
  title: "Search — Quoin Studio",
  /* Search result pages are thin, duplicate each other across query
     strings, and are exactly what a crawler should not be spending its
     budget on. The rooms themselves are indexable; this listing of them
     is not. */
  robots: { index: false, follow: true },
};

export default async function StudioSearchPage({
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
    <StudioShell header={<StudioChrome title="Search" />} barTitle="Search">
      <StudioSearch
        query={filters.q ?? ""}
        initial={feed.ideas}
        initialCursor={feed.nextCursor}
        facets={facets}
        filters={filters}
        resultCount={total}
      />
    </StudioShell>
  );
}
