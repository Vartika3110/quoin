import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioSearch } from "@/components/storefront/studio/StudioSearch";
import { getSession } from "@/lib/auth/session";
import { listFacets, listFeed } from "@/lib/data/studio";

export const metadata: Metadata = {
  title: "Search — Quoin Studio",
  /* Search result pages are thin, duplicate each other across query
     strings, and are exactly what a crawler should not be spending its
     budget on. The ideas themselves are indexable; this listing of them
     is not. */
  robots: { index: false, follow: true },
};

export default async function StudioSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const query = params.q?.trim() ?? "";

  const [feed, facets] = await Promise.all([
    listFeed(session?.userId ?? null, { tab: "new", q: query || undefined }),
    listFacets(),
  ]);

  return (
    <StudioShell>
      <StudioSearch
        query={query}
        initial={feed.ideas}
        initialCursor={feed.nextCursor}
        facets={facets}
      />
    </StudioShell>
  );
}
