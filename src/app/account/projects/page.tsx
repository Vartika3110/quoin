import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { ProjectList } from "@/components/storefront/projects/ProjectList";

export const metadata: Metadata = { title: "Your projects — Quoin" };

export default function AccountProjectsPage() {
  return (
    <AccountShell
      current="/account/projects"
      title="Projects"
      subtitle="Budget, materials, tasks and deliveries for each site you are running."
    >
      <ProjectList />
    </AccountShell>
  );
}
