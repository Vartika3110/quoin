import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Document } from "@/components/icons";

export const metadata: Metadata = { title: "Documents — Quoin" };

export default function DocumentsPage() {
  return (
    <AccountShell
      current="/account/documents"
      title="Documents"
      subtitle="Invoices, specifications, drawings and parchas, kept per project."
    >
      <EmptyState
        icon={<Document className="size-6" />}
        title="Nothing filed yet"
        action={{ href: "/upload", label: "Upload a parcha" }}
        secondaryAction={{ href: "/projects", label: "Open Project Hub" }}
      >
        Documents are filed against the project they belong to rather than a
        single pile — so a drawing for one site never surfaces while you are
        looking at another.
      </EmptyState>
    </AccountShell>
  );
}
