import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioHeader } from "@/components/storefront/studio/StudioHeader";
import { SpacesGrid } from "@/components/storefront/studio/SpacesGrid";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "My spaces — Quoin Studio",
  robots: { index: false, follow: false },
};

export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);

  return (
    <StudioShell
      header={
        <StudioHeader
          title="My spaces"
          subtitle="One room at a time — the ideas you saved for it, what it is made of, and what it will cost."
        />
      }
    >
      <div className="px-5 lg:px-0">
        {session ? (
          <SpacesGrid openNew={params.new === "1"} />
        ) : (
          <SignInPrompt what="Sign in to create spaces — they live on your account, so they are there on any device." />
        )}
      </div>
    </StudioShell>
  );
}
