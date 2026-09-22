import type { Metadata } from "next";
import Link from "next/link";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioChrome } from "@/components/storefront/studio/StudioChrome";
import { ContentCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { People } from "@/components/icons";
import { listDesigners } from "@/lib/data/studio";

export const metadata: Metadata = {
  title: "Designers — Quoin Studio",
  description: "The designers and contractors behind the rooms in Studio.",
  alternates: { canonical: "/studio/designers" },
};

/**
 * Who built these rooms.
 *
 * Empty until a real professional is entered into `studio_designers`, and
 * the empty state says so rather than filling the gap with plausible
 * names. `src/lib/data/services.ts` set that rule for the services side
 * and it is the same rule here: there is no vendor roster behind this
 * app, and a page of invented designers next to a real catalogue teaches
 * a reader that the names on this site are decorative — which makes every
 * other claim on it suspect.
 */
export default async function DesignersPage() {
  const designers = await listDesigners();

  return (
    <StudioShell header={<StudioChrome title="Designers" />} barTitle="Designers">
      <div className="px-5 lg:px-0">
        <div className="lg:hidden">
          <StudioChrome title="Designers" />
        </div>

        {designers.length === 0 ? (
          <EmptyState icon={<People className="size-6" />} title="No designers listed yet">
            Quoin does not list professionals it has not worked with. When a
            designer&rsquo;s rooms are in Studio, their profile and their boards
            will be here — until then this page is empty on purpose. To be
            introduced to one,{" "}
            <Link href="/services" className="font-medium text-accent hover:underline">
              book an expert service
            </Link>
            .
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {designers.map((designer) => (
              <li key={designer.id}>
                <ContentCard
                  href={`/studio/designers/${designer.slug}`}
                  title={designer.name}
                  subtitle={designer.headline}
                  footer={
                    <span className="nums text-caption text-faint">
                      {designer.roomCount}{" "}
                      {designer.roomCount === 1 ? "room" : "rooms"}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </StudioShell>
  );
}
