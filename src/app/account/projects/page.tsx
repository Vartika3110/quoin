import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { ProjectList } from "@/components/storefront/projects/ProjectList";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your projects — Quoin" };

export default async function AccountProjectsPage() {
  const session = await getSession();

  return (
    <AccountShell
      current="/account/projects"
      title="Projects"
      subtitle="Budget, materials, tasks and deliveries for each site you are running."
    >
      {session ? (
        <ProjectList />
      ) : (
        <SignInPrompt what="Signing in keeps every project against your account." />
      )}
    </AccountShell>
  );
}
