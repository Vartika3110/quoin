import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioHeader } from "@/components/storefront/studio/StudioHeader";
import { DiscoveryFeed } from "@/components/storefront/studio/DiscoveryFeed";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { getSession } from "@/lib/auth/session";
import { listFacets, listFeed } from "@/lib/data/studio";

export const metadata: Metadata = {
  title: "Saved ideas — Quoin Studio",
  /* Someone's own collection, scoped to their account. Never something a
     crawler should index — the same rule `/projects/[id]` follows. */
  robots: { index: false, follow: false },
};

export default async function SavedPage() {
  const session = await getSession();

  if (!session) {
    return (
      <StudioShell header={<StudioHeader title="Saved" subtitle="Everything you have saved, on every device you sign in on." />}>
        <div className="px-5 lg:px-0">
          <SignInPrompt what="Sign in to keep what you save — it follows your account, not this browser." />
        </div>
      </StudioShell>
    );
  }

  const [feed, facets] = await Promise.all([
    listFeed(session.userId, { tab: "saved" }),
    listFacets(),
  ]);

  return (
    <StudioShell
      header={
        <StudioHeader
          title="Saved"
          subtitle="Everything you have saved, on every device you sign in on."
        />
      }
    >
      <DiscoveryFeed
        initial={feed.ideas}
        initialCursor={feed.nextCursor}
        facets={facets}
        startTab="saved"
      />
    </StudioShell>
  );
}
