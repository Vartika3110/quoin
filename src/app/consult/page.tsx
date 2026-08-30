import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/storefront/AppShell";
import { ConsultForm } from "@/components/storefront/ConsultForm";
import {
  ConsultAssurances,
  ConsultHero,
  ConsultModeDetail,
  ConsultSteps,
} from "@/components/storefront/consult";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getCategories } from "@/lib/data/catalog";
import { AREA_COOKIE, getAreaChoice, listAreaChoices } from "@/lib/data/service-areas";
import { addDays, CONSULT_HORIZON_DAYS, istDay } from "@/lib/types/consult";

/**
 * Rendered per request, for the same reason the home page is: the areas
 * and categories come from Postgres, which is deliberately unreachable
 * during `next build`.
 *
 * The day rail is the other reason. A prerender would bake "today" into
 * the HTML and keep offering it after midnight, so the first customer of
 * each day would be shown a date the API rejects as past.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Talk to an expert — Quoin",
  description:
    "Book a free video consultation or a measured site visit with a Quoin expert before you order.",
};

export default async function ConsultPage() {
  const [areas, chosen, categories, session] = await Promise.all([
    listAreaChoices(),
    cookies().then((c) => getAreaChoice(c.get(AREA_COOKIE)?.value)),
    getCategories(),
    getSession(),
  ]);

  /* Only the name, and only to save typing it. The phone is left blank on
     purpose: this page renders on shared devices, and the rest of the
     codebase does not put a full number on screen even for its owner. */
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { name: true },
      })
    : null;

  /* Computed on the server so every visitor gets Quoin's calendar rather
     than their device's — see `istDay`. */
  const today = istDay(new Date());
  const days = Array.from({ length: CONSULT_HORIZON_DAYS }, (_, i) => addDays(today, i));

  return (
    <AppShell>
      <div className="space-y-8 pt-4 lg:space-y-10 lg:pt-0">
        <section className="px-5 lg:px-0">
          <ConsultHero />
        </section>

        {/* Two real columns at lg: the form is the page, and the reassurance
            beside it is what a customer reads while deciding to start. On
            mobile the same material stacks underneath, because a sidebar
            above the form would delay the only thing on the page to do. */}
        <div className="px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 lg:px-0">
          <section aria-label="Request a consultation" className="min-w-0">
            <div className="rounded-card border border-line-soft bg-surface p-5 lg:p-6">
              <ConsultForm
                areas={areas}
                categories={categories}
                days={days}
                defaultAreaSlug={chosen?.slug ?? null}
                defaultName={user?.name ?? undefined}
              />
            </div>
          </section>

          <aside className="mt-8 space-y-6 lg:mt-0">
            <div className="rounded-card border border-line-soft bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink">How it works</h2>
              <ConsultSteps />
            </div>

            <div className="rounded-card border border-accent-edge bg-accent-wash p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink">What you can count on</h2>
              <ConsultAssurances />
            </div>
          </aside>
        </div>

        <section aria-label="Consultation modes" className="px-5 lg:px-0">
          <h2 className="mb-3 text-lg font-semibold text-ink">The two ways to do this</h2>
          <ConsultModeDetail />
        </section>
      </div>
    </AppShell>
  );
}
