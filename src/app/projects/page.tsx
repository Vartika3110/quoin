import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProjectList } from "@/components/storefront/projects/ProjectList";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Project Hub — Quoin",
  description:
    "Budget, materials, tasks and deliveries for one site, in one place.",
};

export default function ProjectsPage() {
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
            <Button href="/projects/new" size="sm" className="hidden sm:inline-flex">
              New project
            </Button>
          }
        />

        <div className="px-5 lg:px-0">
          <ProjectList />
        </div>
      </div>
    </AppShell>
  );
}
