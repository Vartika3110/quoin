import type { Metadata } from "next";
import { Placeholder } from "@/components/storefront/Placeholder";

export const metadata: Metadata = { title: "Quoin Studio — Quoin" };

export default function StudioPage() {
  return (
    <Placeholder title="Quoin Studio" cta={{ href: "/consult", label: "Talk to an expert" }}>
      Plan a room, price the materials from the catalogue as you go, and
      hand the finished specification to the people who will build it.
    </Placeholder>
  );
}
