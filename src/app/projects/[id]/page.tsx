import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProjectDashboard } from "@/components/storefront/projects/ProjectDashboard";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const metadata: Metadata = {
  title: "Project — Quoin",
  /* The title and everything on the page come from one browser's own
     store, so there is nothing here for a crawler to index. */
  robots: { index: false, follow: false },
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-4 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Project Hub", href: "/projects" },
              { label: "Project" },
            ]}
          />
        </div>

        <div className="px-5 lg:px-0">
          <ProjectDashboard id={id} />
        </div>
      </div>
    </AppShell>
  );
}
