import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ServiceCard } from "@/components/storefront/ServiceCard";
import { ProductCard } from "@/components/storefront/ProductCard";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead, PageSections } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Badge";
import { ArrowRight, CheckCircle, Headset } from "@/components/icons";
import { listBookableProducts, listServices } from "@/lib/data/services";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Services — Quoin",
  description:
    "Architects, designers, contractors and fitters — quoted against a real scope and booked to a slot.",
};

/**
 * The services index.
 *
 * What this page deliberately does not have: professional profiles,
 * ratings and "from ₹499" prices. There is no vendor table behind this
 * app, so every one of those would be invented — and a marketplace whose
 * ratings are fiction is worse than one with no ratings at all. What is
 * here instead is what Quoin can actually stand behind: what each service
 * covers, how the fee is arrived at, and how long it takes.
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
  const [services, bookable] = await Promise.all([
    listServices(),
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
            <h1 className="mt-3 max-w-2xl text-headline font-semibold text-ink lg:text-headline-lg">
              Find a professional who has built it before.
            </h1>
            <p className="mt-3 max-w-xl text-body-lg leading-relaxed text-muted">
              Eight trades, quoted against a real scope and booked to a slot —
              with the materials ordered on the same project.
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

          <section>
            <SectionHead
              title="What Quoin books"
              subtitle="Each one says what it covers, what it excludes and how it is priced."
            />
            <div className="grid gap-3 px-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-0">
              {services.map((service) => (
                <ServiceCard key={service.slug} service={service} />
              ))}
            </div>
          </section>

          <section className="px-5 lg:px-0">
            <Card padding="lg">
              <h2 className="text-title font-semibold text-ink">How it works</h2>
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
            <Card tone="accent" padding="lg" className="flex flex-wrap items-center gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
                <Headset className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-ink">
                  Not sure which trade you need?
                </p>
                <p className="mt-0.5 text-caption text-muted">
                  Twenty minutes on a call, free, with nothing to buy at the end.
                </p>
              </div>
              <Button href="/consult" className="shrink-0">
                Book a consultation
              </Button>
            </Card>
          </section>

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
