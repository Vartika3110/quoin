import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioChrome } from "@/components/storefront/studio/StudioChrome";
import { SpacesGrid } from "@/components/storefront/studio/SpacesGrid";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Your boards — Quoin Studio",
  robots: { index: false, follow: false },
};

/* "Board", not "space". The word was doing two jobs in this product — a
   room somebody is working on, and a room in a photograph — and one of
   them had to give it up. The route stays `/studio/spaces`: renaming a
   URL people have saved and shared buys nothing, and `/studio/boards`
   redirects here so the word is also a URL that works. */
const SUBTITLE =
  "One room at a time — the pins you saved for it, what it is made of, and what it will cost.";

export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);

  return (
    <StudioShell
      header={<StudioChrome title="Boards" subtitle={SUBTITLE} />}
      barTitle="Boards"
    >
      <div className="px-5 lg:px-0">
        <div className="mb-4 lg:hidden">
          <StudioChrome title="Boards" />
        </div>

        {session ? (
          <SpacesGrid openNew={params.new === "1"} />
        ) : (
          <SignInPrompt what="Sign in to create boards — they live on your account, so they are there on any device." />
        )}
      </div>
    </StudioShell>
  );
}
