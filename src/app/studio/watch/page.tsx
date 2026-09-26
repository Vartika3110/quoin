import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioChrome } from "@/components/storefront/studio/StudioChrome";
import { WatchFeed } from "@/components/storefront/studio/WatchFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { Video } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { countWatchFeed, listWatchFeed } from "@/lib/data/studio";

export const metadata: Metadata = {
  title: "Watch — Quoin Studio",
  description:
    "Rooms on film, with what each one is made of priced line by line as it plays.",
  alternates: { canonical: "/studio/watch" },
  openGraph: {
    title: "Watch — Quoin Studio",
    description: "Architects walking through rooms they built, priced as they go.",
    url: "/studio/watch",
    type: "website",
  },
};

/**
 * Studio, playing.
 *
 * Two renders, and which one you get is a fact about the database rather
 * than a flag: with clips this is a full-bleed swipe feed with no chrome
 * at all, and with none it is an ordinary Studio page that says so.
 *
 * The empty render is the one that matters today, because **there are no
 * clips**. Studio has no room photography either — see `imageUrlFor` —
 * and film is a harder thing to get than a still: it needs an architect
 * who will walk a room with a phone and name what is in it. The page
 * exists now so that the day one of them does, the clip has somewhere to
 * land; what the page must not do in the meantime is open a black player
 * and leave a reader to work out that the silence is the product.
 *
 * `countWatchFeed` rather than `pins.length` for the decision, so that a
 * deploy which *has* clips but cannot play them — `CF_STREAM_CUSTOMER_CODE`
 * unset — is distinguishable in a log from one that has none. Both
 * render the same empty state, because both are, to a reader, a Studio
 * with nothing to watch.
 */
export default async function WatchPage() {
  const session = await getSession();
  const viewerId = session?.userId ?? null;

  const [total, feed] = await Promise.all([countWatchFeed(), listWatchFeed(viewerId)]);

  if (feed.pins.length === 0) {
    return (
      <StudioShell
        header={
          <StudioChrome subtitle="Rooms on film, priced line by line as they play." />
        }
        barTitle="Watch"
      >
        <div className="px-5 lg:px-0">
          <EmptyState
            icon={<Video className="size-6" />}
            title="No rooms on film yet"
            action={{ href: "/studio", label: "Browse the wall" }}
            secondaryAction={{ href: "/consult", label: "Talk to an expert" }}
          >
            {total > 0
              ? "The clips that exist are not playable from this deployment yet. The wall has the same rooms as photographs, priced the same way."
              : "This is where an architect walks through a room they built and names what is in it, with every line priced as it goes. Nobody has filmed one yet — and a page of stock footage of somebody else's kitchen with our prices under it would not be the same thing."}
          </EmptyState>
        </div>
      </StudioShell>
    );
  }

  /* No `StudioShell`. A clip that fills the screen cannot also sit under
     a masthead and a tab bar, and the feed draws its own way out. */
  return <WatchFeed initial={feed.pins} initialCursor={feed.nextCursor} />;
}
