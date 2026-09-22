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
import { TrackEvent } from "@/components/analytics/TrackEvent";
import {
  Alert,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  Pin,
  Rupee,
} from "@/components/icons";
import { getServiceBySlug, listServices } from "@/lib/data/services";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return { title: "Not found — Quoin" };
  return {
    title: `${service.name} — Quoin`,
    description: service.summary,
  };
}

export default async function ServicePage({ params, searchParams }: Ctx) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) notFound();

  const sp = await searchParams;
  const projectId = one(sp.project);
  const projectQuery = projectId ? `&project=${encodeURIComponent(projectId)}` : "";

  const all = await listServices();
  const others = all.filter((s) => s.slug !== slug).slice(0, 3);

  const bookHref = `/services/book?service=${slug}${projectQuery}`;
  const quoteHref = `/services/book?service=${slug}&mode=quote${projectQuery}`;

  return (
    <AppShell>
      <TrackEvent event="service_viewed" props={{ service: slug }} />
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
            <h1 className="font-display mt-3 text-headline font-semibold text-ink lg:text-headline-lg">
              {service.name}
            </h1>
            <p className="mt-3 max-w-prose text-body-lg leading-relaxed text-muted">
              {service.description}
            </p>

            <section className="mt-10">
              <h2 className="font-display text-title font-semibold text-ink">
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
              <h2 className="font-display text-title font-semibold text-ink">What it does not cover</h2>
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
              <h2 className="font-display text-title font-semibold text-ink">
                What you need to provide
              </h2>
              <ul className="mt-4 space-y-2.5">
                {service.youProvide.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="text-body leading-relaxed text-ink">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="font-display text-title font-semibold text-ink">
                Duration, availability and area
              </h2>
              <Card padding="lg" className="mt-4">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="flex gap-3">
                    <Clock className="mt-0.5 size-4 shrink-0 text-muted" />
                    <div>
                      <dt className="text-micro text-muted">Duration</dt>
                      <dd className="mt-0.5 text-body-sm text-ink">{service.duration}</dd>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Calendar className="mt-0.5 size-4 shrink-0 text-muted" />
                    <div>
                      <dt className="text-micro text-muted">Availability</dt>
                      <dd className="mt-0.5 text-body-sm text-ink">{service.availability}</dd>
                    </div>
                  </div>
                  <div className="flex gap-3 sm:col-span-2">
                    <Pin className="mt-0.5 size-4 shrink-0 text-muted" />
                    <div>
                      <dt className="text-micro text-muted">Service area</dt>
                      <dd className="mt-0.5 text-body-sm text-ink">
                        {service.serviceArea}{" "}
                        <a href="/consult" className="text-accent">
                          Check your area
                        </a>
                      </dd>
                    </div>
                  </div>
                </dl>
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
                    Starting price
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

              {service.bookingMode === "book" ? (
                <>
                  <Button href={bookHref} block size="lg" className="mt-6">
                    Book Service
                  </Button>
                  <Button href={quoteHref} block variant="outline" className="mt-2">
                    Request a Quote
                  </Button>
                </>
              ) : (
                <>
                  <Button href={quoteHref} block size="lg" className="mt-6">
                    Request a Quote
                  </Button>
                  <Button href="/consult" block variant="outline" className="mt-2">
                    Talk to an expert
                  </Button>
                </>
              )}

              {service.shopCategorySlug && (
                <Button
                  href={`/c/${service.shopCategorySlug}`}
                  block
                  variant="ghost"
                  className="mt-2"
                >
                  Shop the materials
                </Button>
              )}

              <p className="mt-4 text-micro leading-relaxed text-faint">
                Nothing is charged online. A booking or a quote request only
                starts the conversation.
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
          <Button
            href={service.bookingMode === "book" ? bookHref : quoteHref}
            size="lg"
            className="shrink-0"
          >
            {service.bookingMode === "book" ? "Book" : "Get a quote"}
            <ArrowRight className="size-4" />
          </Button>
        </StickyBar>
      </div>
    </AppShell>
  );
}
