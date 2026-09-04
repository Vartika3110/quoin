import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProjectWizard } from "@/components/storefront/projects/ProjectWizard";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { listAreaChoices } from "@/lib/data/service-areas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New project — Quoin" };

export default async function NewProjectPage() {
  /* The serviceable areas, so the location step offers the places Quoin
     can actually deliver to before offering a free-text field. */
  const areas = await listAreaChoices();

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
          <ProjectWizard
            areas={areas.map((a) => ({ slug: a.slug, name: a.name }))}
          />
        </div>
      </div>
    </AppShell>
  );
}
