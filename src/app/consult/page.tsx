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
import { ExpertSession } from "@/components/storefront/consult/ExpertSession";
import { JsonLd } from "@/components/analytics/JsonLd";
import { Accordion } from "@/components/ui/Accordion";
import { CONSULT_FAQ, consultFaqSchema } from "@/lib/consult/faq";
import { isRazorpayConfigured } from "@/lib/payments/razorpay";
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
    "Book a 15–20 minute video consultation with a Quoin expert from ₹99 — repairs, product selection or interiors — or ask for a free call back.",
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
      {/* These answers are on the page in full rather than teased on it,
          which is the condition the structured-data guidance actually
          sets — see `consultFaqSchema`. */}
      <JsonLd data={consultFaqSchema()} />

      <div className="space-y-8 pt-4 lg:space-y-10 lg:pt-0">
        <section className="px-5 lg:px-0">
          <ConsultHero />
        </section>

        {/* The paid call first, and the free call back second.

            Not a ranking of how much Quoin wants the money. It is what
            the page is for: somebody who has arrived here has a question
            they want answered by a person at a known time, and a booked
            20-minute slot is the only thing on this page that promises
            that. The free call back promises a call back, which is a
            weaker and vaguer offer — right for a quick question, wrong
            as the headline. Both stay, and the FAQ at the foot says
            plainly which one a quick question belongs in. */}
        <section aria-label="Book a video consultation" className="px-5 lg:px-0">
          <h2 className="font-display mb-1 text-title font-semibold text-ink">
            Book a video consultation
          </h2>
          <p className="mb-4 text-caption text-muted">
            15–20 minutes with an expert, at a time you pick. From ₹99, inclusive of GST.
          </p>
          <div className="rounded-card border border-line-soft bg-surface p-5 lg:p-6">
            <ExpertSession
              areas={areas}
              categories={categories}
              defaultAreaSlug={chosen?.slug ?? null}
              defaultName={user?.name ?? undefined}
              /* Read on the server so the section can say "not switched
                 on yet" instead of offering a button that opens a
                 payment sheet with no gateway behind it — the honest
                 state for the days or weeks gateway KYC takes. */
              paymentsReady={isRazorpayConfigured()}
            />
          </div>
        </section>

        {/* Two real columns at lg: the form is the page, and the reassurance
            beside it is what a customer reads while deciding to start. On
            mobile the same material stacks underneath, because a sidebar
            above the form would delay the only thing on the page to do. */}
        <div className="px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 lg:px-0">
          <section aria-label="Request a free call back" className="min-w-0">
            <h2 className="font-display mb-1 text-title font-semibold text-ink">
              Or ask for a free call back
            </h2>
            <p className="mb-4 text-caption text-muted">
              No fee, no fixed time — an expert rings you back, or comes to the site to measure.
            </p>
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
              <h2 className="font-display mb-3 text-title-sm font-semibold text-ink">
                How it works
              </h2>
              <ConsultSteps />
            </div>

            <div className="rounded-card border border-accent-edge bg-accent-wash p-5">
              <h2 className="font-display mb-3 text-title-sm font-semibold text-ink">
                What you can count on
              </h2>
              <ConsultAssurances />
            </div>
          </aside>
        </div>

        <section aria-label="Consultation modes" className="px-5 lg:px-0">
          <h2 className="font-display mb-3 text-title font-semibold text-ink">
            The two ways to do this
          </h2>
          <ConsultModeDetail />
        </section>

        {/* At the foot, as drawers rather than a wall of text.

            The opposite call from `/faq`, which deliberately uses no
            accordion — and the difference is what the reader is doing.
            That page is scanned by somebody who came looking for one
            answer. This list sits under a form, read by somebody who has
            nearly decided and has two or three specific doubts; drawers
            let them open theirs without scrolling past twelve they do
            not have. */}
        <section aria-label="Consultation questions" className="px-5 lg:px-0">
          <h2 className="font-display mb-3 text-title font-semibold text-ink">
            Questions people ask before booking
          </h2>
          <div className="space-y-2">
            {CONSULT_FAQ.map((entry, i) => (
              <Accordion key={entry.q} title={entry.q} defaultOpen={i === 0}>
                <p className="text-body text-muted">{entry.a}</p>
              </Accordion>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
