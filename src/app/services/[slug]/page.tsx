import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/storefront/AppShell";
import { ServiceCard } from "@/components/storefront/ServiceCard";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Badge";
import { StickyBar } from "@/components/storefront/StickyBar";
import { Alert, ArrowRight, CheckCircle, Clock, Rupee } from "@/components/icons";
import { getServiceBySlug, listServices } from "@/lib/data/services";
import { CONSULT_MODE_INFO } from "@/lib/types/consult";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return { title: "Not found — Quoin" };
  return {
    title: `${service.name} — Quoin`,
    description: service.summary,
  };
}

export default async function ServicePage({ params }: Ctx) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) notFound();

  const all = await listServices();
  const others = all.filter((s) => s.slug !== slug).slice(0, 3);
  const mode = CONSULT_MODE_INFO[service.startsWith];

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-4 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Services", href: "/services" },
              { label: service.name },
            ]}
          />
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
          <div className="min-w-0 px-5 lg:px-0">
            <Eyebrow>Service</Eyebrow>
            <h1 className="mt-3 text-headline font-semibold text-ink lg:text-headline-lg">
              {service.name}
            </h1>
            <p className="mt-3 max-w-prose text-body-lg leading-relaxed text-muted">
              {service.description}
            </p>

            <section className="mt-10">
              <h2 className="text-title font-semibold text-ink">
                What is included
              </h2>
              <ul className="mt-4 space-y-2.5">
                {service.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-success" />
                    <span className="text-body leading-relaxed text-ink">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="text-title font-semibold text-ink">What it does not cover</h2>
              <ul className="mt-4 space-y-2.5">
                {service.excludes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Alert className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span className="text-body leading-relaxed text-muted">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 max-w-prose text-caption leading-relaxed text-faint">
                Stated up front on purpose. Most disputes on a building site
                are about a line somebody assumed was in the quote.
              </p>
            </section>

            <section className="mt-10">
              <h2 className="text-title font-semibold text-ink">How it starts</h2>
              <Card padding="lg" className="mt-4">
                <p className="text-body-sm font-semibold text-ink">{mode.title}</p>
                <p className="mt-1 text-caption text-muted">{mode.summary}</p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-micro text-muted">Duration</dt>
                    <dd className="mt-0.5 text-body-sm text-ink">{mode.duration}</dd>
                  </div>
                  <div>
                    <dt className="text-micro text-muted">Fee</dt>
                    <dd className="mt-0.5 text-body-sm text-ink">{mode.price}</dd>
                  </div>
                </dl>
                <p className="mt-4 border-t border-line-hair pt-3 text-caption leading-relaxed text-muted">
                  {mode.limit}
                </p>
              </Card>
            </section>
          </div>

          {/* The booking panel. Sticky on a desktop, and replaced by the
              sticky bar at the foot on a phone. */}
          <aside className="mt-10 px-5 lg:sticky lg:top-24 lg:mt-0 lg:px-0">
            <Card padding="lg">
              <dl className="space-y-4">
                <div>
                  <dt className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wide text-muted">
                    <Rupee className="size-3.5" />
                    Pricing
                  </dt>
                  <dd className="mt-1 text-body leading-relaxed text-ink">
                    {service.pricing}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wide text-muted">
                    <Clock className="size-3.5" />
                    Timeline
                  </dt>
                  <dd className="mt-1 text-body leading-relaxed text-ink">
                    {service.timeline}
                  </dd>
                </div>
              </dl>

              <Button href="/consult" block size="lg" className="mt-6">
                Book a {mode.title.toLowerCase()}
              </Button>

              {service.shopCategorySlug && (
                <Button
                  href={`/c/${service.shopCategorySlug}`}
                  block
                  variant="outline"
                  className="mt-2"
                >
                  Shop the materials
                </Button>
              )}

              <p className="mt-4 text-micro leading-relaxed text-faint">
                Booking starts a conversation, not a contract. Nothing is
                charged until a scope is agreed.
              </p>
            </Card>
          </aside>
        </div>

        {others.length > 0 && (
          <section className="mt-16">
            <SectionHead title="Other services" href="/services" />
            <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:scroll-pl-0">
              {others.map((other) => (
                <ServiceCard
                  key={other.slug}
                  service={other}
                  className="w-72 shrink-0 lg:w-auto"
                />
              ))}
            </div>
          </section>
        )}

        <StickyBar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-semibold text-ink">
              {service.name}
            </p>
            <p className="truncate text-micro text-muted">{service.pricing}</p>
          </div>
          <Button href="/consult" size="lg" className="shrink-0">
            Book
            <ArrowRight className="size-4" />
          </Button>
        </StickyBar>
      </div>
    </AppShell>
  );
}
