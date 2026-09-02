import type { Metadata } from "next";
import { Placeholder } from "@/components/storefront/Placeholder";

export const metadata: Metadata = { title: "Quoin Pro — Quoin" };

export default function ProPage() {
  return (
    <Placeholder title="Quoin Pro" cta={{ href: "/products", label: "Browse the catalogue" }}>
      Trade pricing, priority dispatch and a dedicated project manager, for
      contractors and architects buying at volume. Pro rates already sit
      against the products that have them; membership is what is missing.
    </Placeholder>
  );
}
