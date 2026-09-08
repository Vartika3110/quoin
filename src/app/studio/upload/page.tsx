import type { Metadata } from "next";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioHeader } from "@/components/storefront/studio/StudioHeader";
import { UploadIdea } from "@/components/storefront/studio/UploadIdea";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Add inspiration — Quoin Studio",
  description:
    "Add a photograph of a room to Quoin Studio, tag what it is made of, and find the materials in the catalogue.",
};

export default async function UploadIdeaPage() {
  const session = await getSession();

  return (
    <StudioShell
      header={
        <StudioHeader
          title="Add inspiration"
          subtitle="A room you have finished, or one you are working on. Tag what it is made of and Studio will look for those materials in the catalogue."
        />
      }
    >
      <div className="px-5 lg:px-0">
        {session ? (
          <UploadIdea />
        ) : (
          <SignInPrompt what="Sign in to add a photograph — it is filed against your account, so you can edit or remove it later." />
        )}
      </div>
    </StudioShell>
  );
}
