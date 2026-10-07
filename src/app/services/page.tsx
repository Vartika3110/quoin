import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Gutter, SectionHead, PageSections } from "@/components/ui/Section";
import { ConsultBand } from "@/components/storefront/ConsultBand";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Badge";
import { ArrowRight, CheckCircle } from "@/components/icons";
import { listBookableProducts } from "@/lib/data/services";
import { listProfessionals } from "@/lib/data/professionals";
import { ProfessionalRail } from "@/components/storefront/home/ProfessionalRail";

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
const HOW = [
  {
    title: "Tell us the scope",
    detail: "A short call, or a site visit if the job needs measuring.",
  },
  {
    title: "Get a quote against it",
    detail: "Priced to what was seen, not to a bracket picked off a page.",
  },
  {
    title: "Book it to a slot",
    detail: "A date you chose, with the materials ordered against the same project.",
  },
];

export default async function ServicesPage() {
  const [people, bookable] = await Promise.all([
    listProfessionals(),
    listBookableProducts(),
  ]);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Services" }]} />
        </div>

        <PageSections>
          <header className="px-5 lg:px-0">
            <Eyebrow>Expert services</Eyebrow>
            <h1 className="font-display mt-3 max-w-2xl text-headline font-semibold text-ink lg:text-headline-lg">
              Find a professional who has built it before.
            </h1>
            {/* Describes the roster below it, not a grid of trades — that
                grid is gone, and the sentence counting it went with it.
                It said "Eight trades" against ten services, which is its
                own reason to have rewritten it. */}
            <p className="mt-3 max-w-xl text-body-lg leading-relaxed text-muted">
              Electricians, plumbers, painters, carpenters and tilers who
              work these localities — booked through Quoin, quoted after
              the visit, with the materials ordered on the same project.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href="/consult" size="lg">
                Talk to an expert
                <ArrowRight className="size-4" />
              </Button>
              <Button href="/projects/new" size="lg" variant="outline">
                Start a project
              </Button>
            </div>
          </header>

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
              <ProfessionalRail people={people} layout="list" />
            </section>
          )}

          <section className="px-5 lg:px-0">
            <Card padding="lg">
              <h2 className="font-display text-title font-semibold text-ink">How it works</h2>
              <ol className="mt-5 grid gap-5 sm:grid-cols-3">
                {HOW.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="nums grid size-7 shrink-0 place-items-center rounded-full bg-accent-wash text-caption font-semibold text-accent">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-body-sm font-semibold text-ink">
                        {step.title}
                      </p>
                      <p className="mt-1 text-caption leading-relaxed text-muted">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </section>

          {/* Priced, buyable service rows — kept apart from the quoted
              engagements above, because conflating the two is how a
              customer ends up expecting a fixed price for a rewire. */}
          {bookable.length > 0 && (
            <section>
              <SectionHead
                title="Book and pay upfront"
                subtitle="Services with a fixed fee, bought like any other product."
              />
              <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0">
                {bookable.map((product) => (
                  <ProductCard key={product.id} product={product} fill />
                ))}
              </div>
            </section>
          )}

          <section className="px-5 lg:px-0">
            <div className="rounded-card border border-line-soft bg-surface p-5">
              <p className="flex items-start gap-2 text-caption leading-relaxed text-muted">
                <CheckCircle className="mt-0.5 size-4 shrink-0 text-accent" />
                Quoin does not publish professional profiles or star ratings
                yet. When it does, they will come from completed jobs on this
                platform rather than from a directory — a rating nobody earned
                here would tell you nothing about the person who turns up.
              </p>
            </div>
          </section>
        </PageSections>
      </div>
    </AppShell>
  );
}
