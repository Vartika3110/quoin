import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Gutter, SectionHead, PageSections } from "@/components/ui/Section";
import { ConsultBand } from "@/components/storefront/ConsultBand";
import { listProfessionals } from "@/lib/data/professionals";
import { RosterSearch } from "@/components/storefront/services/RosterSearch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Services — Quoin",
  description:
    "Architects, designers, contractors and fitters — quoted against a real scope and booked to a slot.",
};

/**
 * The services index.
 *
 * **The roster is here now.** This page used to say, in this comment,
 * that it deliberately had no professional profiles because there was no
 * vendor table behind the app. There is a roster now — thirty real
 * tradespeople — so the people are listed, and the home page is no longer
 * the only place they appear. That was the odd part: eight of them showed
 * on the front page and the page called Services showed none.
 *
 * What is still deliberately absent is the rest of that sentence —
 * ratings and "from ₹499" prices. Nobody has been rated and no fee has
 * been set, and a marketplace whose ratings are fiction is worse than one
 * with no ratings at all. The cards show what is true: the trade, the
 * area, when they work, and that the fee is quoted after the visit.
 */

export default async function ServicesPage() {
  const people = await listProfessionals();

  return (
    <AppShell phoneSearch={false}>
      <div className="pt-4 lg:pt-6">
        <PageSections>
          <Gutter>
            <ConsultBand
              title="Not sure which trade you need?"
              detail="Describe the job on a free video call and we will scope it"
            />
          </Gutter>

          {/* Every one of them, not the eight the home page shows. This is
              the page that "View all" leads to, so it has to be the whole
              roster or the link is a lie. */}
          {people.length > 0 && (
            <section>
              <SectionHead
                title="The people who do the work"
                subtitle="Booked through Quoin, paid against a quote after the visit."
              />
              <RosterSearch
                people={people}
                leading={
                  <Breadcrumb
                    items={[{ label: "Home", href: "/" }, { label: "Services" }]}
                  />
                }
              />
            </section>
          )}



        </PageSections>
      </div>
    </AppShell>
  );
}
