import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProjectList } from "@/components/storefront/projects/ProjectList";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Project Hub — Quoin",
  description:
    "Budget, materials, tasks and deliveries for one site, in one place.",
};

/**
 * Projects now live against the account, not this browser, so there is no
 * guest version of this page to fall back to — the same gate
 * `/account/orders` already uses, not a new pattern.
 */
export default async function ProjectsPage() {
  const session = await getSession();

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb
            items={[{ label: "Home", href: "/" }, { label: "Project Hub" }]}
          />
        </div>

        <SectionHead
          level={1}
          size="lg"
          title="Project Hub"
          subtitle="Every order, booking and quote for one site, gathered so a build reads as a single project."
          action={
            session ? (
              <Button href="/projects/new" size="sm" className="hidden sm:inline-flex">
                New project
              </Button>
            ) : undefined
          }
        />

        <div className="px-5 lg:px-0">
          {session ? (
            <ProjectList />
          ) : (
            <SignInPrompt what="Signing in keeps every project against your account, so it is there on any device you sign into." />
          )}
        </div>
      </div>
    </AppShell>
  );
}
