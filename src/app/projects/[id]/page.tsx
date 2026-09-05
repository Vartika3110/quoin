import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProjectDashboard } from "@/components/storefront/projects/ProjectDashboard";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Project — Quoin",
  /* A signed-in customer's own data, scoped to their account — never
     something a crawler should index. */
  robots: { index: false, follow: false },
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

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
          {session ? (
            <ProjectDashboard id={id} />
          ) : (
            <SignInPrompt what="Sign in to see this project — it lives on your account now, not this browser." />
          )}
        </div>
      </div>
    </AppShell>
  );
}
