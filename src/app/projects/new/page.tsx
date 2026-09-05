import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProjectWizard } from "@/components/storefront/projects/ProjectWizard";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { listAreaChoices } from "@/lib/data/service-areas";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New project — Quoin" };

export default async function NewProjectPage() {
  const session = await getSession();

  /* The serviceable areas, so the location step offers the places Quoin
     can actually deliver to before offering a free-text field. Skipped
     when signed out — nothing on this page needs them if the wizard is
     not going to render at all. */
  const areas = session ? await listAreaChoices() : [];

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-6 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Project Hub", href: "/projects" },
              { label: "New" },
            ]}
          />
        </div>

        <div className="px-5 lg:px-0">
          {session ? (
            <ProjectWizard
              areas={areas.map((a) => ({ slug: a.slug, name: a.name }))}
            />
          ) : (
            <SignInPrompt what="Sign in to start a project — it will follow you to any device you sign into." />
          )}
        </div>
      </div>
    </AppShell>
  );
}
