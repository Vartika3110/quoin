import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioHeader } from "@/components/storefront/studio/StudioHeader";
import { DiscoveryFeed } from "@/components/storefront/studio/DiscoveryFeed";
import { getSession } from "@/lib/auth/session";
import { listFacets, listFeed } from "@/lib/data/studio";

export const metadata: Metadata = {
  title: "Project Studio — Quoin",
  description:
    "Collect rooms you like, work out what they are made of, and price the materials from the Quoin catalogue as you go.",
  alternates: { canonical: "/studio" },
  openGraph: {
    title: "Project Studio — Quoin",
    description:
      "Inspiration, moodboards and materials for the room you are building.",
    url: "/studio",
    type: "website",
  },
};

/**
 * Studio's front door.
 *
 * The first page of the feed and the filter facets are fetched here, on
 * the server, and handed to the client component already rendered.
 * Fetching them from an effect instead would mean the entire point of the
 * page — photographs — arrives one round trip late, behind a skeleton, on
 * every visit.
 *
 * Public. A signed-out visitor browses and searches; the save button
 * sends them to `/signin` with a `next` that brings them back. That is
 * section 33, and it is why this reads the session rather than requiring
 * one.
 */
export default async function StudioPage() {
  const session = await getSession();

  const [feed, facets] = await Promise.all([
    listFeed(session?.userId ?? null, { tab: "new" }),
    listFacets(),
  ]);

  return (
    <StudioShell header={<StudioHeader />}>
      <DiscoveryFeed
        initial={feed.ideas}
        initialCursor={feed.nextCursor}
        facets={facets}
      />
    </StudioShell>
  );
}
