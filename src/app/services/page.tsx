import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Gutter, PageSections } from "@/components/ui/Section";
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
      {/* No `pt` on a phone. `PageSections` already pads its own top, so
          this was two paddings stacked — 41px of empty ground between the
          header and the breadcrumb, which read as a gap where something
          had failed to render rather than as breathing room. The page
          used to open with a heading, which filled it; it opens with the
          trail now, and a trail belongs close under the chrome it
          continues. */}
      <div className="lg:pt-6">
        <PageSections>
          {/* One component owns the whole page below the chrome: the trail
              and its field, the band, then the roster it filters. The band
              is handed in rather than rendered beside it because the search
              row has to sit *above* it and the chips below — which is one
              component's layout, not two siblings'. */}
          {people.length > 0 && (
            <section>
              <RosterSearch
                people={people}
                leading={
                  <Breadcrumb
                    items={[{ label: "Home", href: "/" }, { label: "Services" }]}
                  />
                }
                banner={
                  <Gutter>
                    <ConsultBand
                      title="Not sure which trade you need?"
                      detail="Describe the job on a free video call and we will scope it"
                    />
                  </Gutter>
                }
              />
            </section>
          )}

        </PageSections>
      </div>
    </AppShell>
  );
}
