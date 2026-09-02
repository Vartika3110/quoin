import type { Metadata } from "next";
import { Placeholder } from "@/components/storefront/Placeholder";

export const metadata: Metadata = { title: "Project Hub — Quoin" };

export default function ProjectsPage() {
  return (
    <Placeholder title="Project Hub" cta={{ href: "/products", label: "Browse the catalogue" }}>
      Every order, booking and quote for one site, gathered in one place —
      so a renovation running over months reads as a single project rather
      than a list of unrelated purchases.
    </Placeholder>
  );
}
