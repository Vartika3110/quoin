import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioChrome } from "@/components/storefront/studio/StudioChrome";
import { PinGrid } from "@/components/storefront/studio/PinGrid";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { EmptyState } from "@/components/ui/EmptyState";
import { Heart } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { listFeed } from "@/lib/data/studio";

export const metadata: Metadata = {
  title: "Saved — Quoin Studio",
  /* Someone's own collection, scoped to their account. Never something a
     crawler should index — the same rule `/projects/[id]` follows. */
  robots: { index: false, follow: false },
};

const SUBTITLE = "Everything you have saved, on every device you sign in on.";

/**
 * Saves are not filtered to rooms.
 *
 * The discovery wall shows `SPACE` pins only, because that is what it is
 * for. This page shows what somebody actually saved — which can include a
 * product photograph they reached from its own URL — and quietly hiding
 * one of their saves because it is the wrong `kind` would be the app
 * losing something they kept.
 */
export default async function SavedPage() {
  const session = await getSession();

  if (!session) {
    return (
      <StudioShell
        header={<StudioChrome title="Saved" subtitle={SUBTITLE} />}
        barTitle="Saved"
      >
        <div className="px-5 lg:px-0">
          <div className="mb-4 lg:hidden">
            <StudioChrome title="Saved" />
          </div>
          <SignInPrompt what="Sign in to keep what you save — it follows your account, not this browser." />
        </div>
      </StudioShell>
    );
  }

  const feed = await listFeed(session.userId, { tab: "saved" });

  return (
    <StudioShell
      header={<StudioChrome title="Saved" subtitle={SUBTITLE} />}
      barTitle="Saved"
    >
      <div className="flex flex-col gap-5">
        <div className="lg:hidden">
          <StudioChrome title="Saved" />
        </div>

        <PinGrid
          initial={feed.ideas}
          initialCursor={feed.nextCursor}
          queryString="tab=saved"
          label="Saved rooms"
          empty={
            <EmptyState
              icon={<Heart className="size-6" />}
              title="Nothing saved yet"
              action={{ href: "/studio", label: "Find a room you like" }}
            >
              Save what you like and it will be here, on every device you sign
              in on.
            </EmptyState>
          }
        />
      </div>
    </StudioShell>
  );
}
