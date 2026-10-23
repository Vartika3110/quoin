import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/storefront/AppShell";
import { SERVICE_ICON } from "@/components/storefront/ServiceCard";
import { Button } from "@/components/ui/Button";
import { SectionHead } from "@/components/ui/Section";
import { Chevron, Headset, People } from "@/components/icons";
import { EXPERT_FRAMING, getExpertRoster } from "@/lib/data/experts";
import { initialsOf } from "@/lib/data/professionals";
import { CONSULT_TOPIC_INFO, formatFee } from "@/lib/types/consult";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Experts — Quoin",
  description:
    "Specialist work: architecture, interior design, bespoke joinery, fine finishes and measured surveys — and the tradespeople who do it.",
};

/**
 * The specialist end of what Quoin can send you.
 *
 * ## What is deliberately not on this page
 *
 * A leaderboard. No ratings, no job counts, no response times, no
 * "top-rated artisan" badges, no portfolios. `src/lib/data/experts.ts`
 * carries the reasoning and `src/lib/data/professionals.ts` set the rule
 * before it: thirty real people are named here, and none of them has
 * agreed to a score. A fabricated 4.9 beside a real person's name is the
 * single most damaging thing a marketplace can publish, because it
 * teaches the customer that every number on the site is decorative.
 *
 * So the filter the brief asks for — "more specific on high skilled
 * expert professional" — is applied to the **work** rather than to the
 * people: the services that are specialist by nature, and the trades that
 * do them. That is a claim Quoin can stand behind today, and it is the
 * same page the day somebody starts marking individuals by hand
 * (`Professional.expert`).
 *
 * The paragraph that used to say "we do not rate or rank these people" in
 * so many words is gone at the owner's instruction. The *absence* is what
 * carries it: there is no star, no job count and no badge anywhere on
 * these cards, only a name, a trade and where they work. Nothing here
 * claims a ranking, so nothing here needs to disclaim one — but the rule
 * behind it is unchanged, and the four empty fields on `Professional` are
 * still not to be filled in to make this page look fuller.
 *
 * The paid consultation sits in the middle of the page rather than at the
 * foot, because it is the one thing here a customer can act on in the
 * next twenty minutes.
 */
export default async function ExpertsPage() {
  const { services, crafts, total } = await getExpertRoster();

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <SectionHead
          title="Experts"
          subtitle="The work that needs judgement and craft rather than a spanner — design, bespoke joinery, fine finishes and measured survey."
          href="/services"
          linkLabel="All services"
        />

        <div className="space-y-10">
          {/* ---- The specialist work ------------------------------- */}
          <section>
            <div className="grid gap-3 px-5 sm:grid-cols-2 lg:px-0">
              {services.map((service) => {
                const Icon = SERVICE_ICON[service.icon];
                return (
                  <Link
                    key={service.slug}
                    href={`/services/${service.slug}`}
                    className="group flex gap-4 rounded-card border border-line-soft bg-surface p-5 transition-colors hover:border-line-strong hover:bg-hover"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-wash text-accent">
                      <Icon className="size-5.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-body font-semibold text-ink">
                        {service.name}
                        <Chevron className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                      </span>
                      <span className="mt-1 block text-caption leading-snug text-muted">
                        {EXPERT_FRAMING[service.slug] ?? service.summary}
                      </span>
                      {/* The real pricing basis from the service itself —
                          never a number nobody has agreed to. */}
                      <span className="mt-2 block text-micro text-faint">{service.pricing}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ---- Talk to one first --------------------------------- */}
          <section className="px-5 lg:px-0">
            <div className="rounded-card border border-accent-edge bg-accent-wash p-5 lg:flex lg:items-center lg:justify-between lg:gap-6">
              <div className="min-w-0">
                <h2 className="font-display text-title-sm font-semibold text-ink">
                  Not sure which of these you need?
                </h2>
                <p className="mt-1 text-caption text-muted">
                  Book 15–20 minutes with an expert on video before committing to any of it.
                  From {formatFee(CONSULT_TOPIC_INFO.repair.feePaise)} for repair advice,{" "}
                  {formatFee(CONSULT_TOPIC_INFO.interior.feePaise)} for interiors.
                </p>
              </div>
              <Button href="/consult" variant="primary" size="md" className="mt-4 lg:mt-0">
                <Headset className="size-4.5" />
                Talk to an expert
              </Button>
            </div>
          </section>

          {/* ---- The people --------------------------------------- */}
          {crafts.length > 0 && (
            <section>
              <SectionHead
                title="The people who do it"
                subtitle={`${total} tradespeople on Quoin's own roster, grouped by trade.`}
                size="sm"
                level={3}
              />

              <div className="space-y-6">
                {crafts.map((craft) => (
                  <div key={craft.trade}>
                    <h4 className="mb-2 px-5 text-caption font-semibold text-ink lg:px-0">
                      {craft.trade}
                      <span className="ml-2 font-normal text-muted">
                        {craft.people.length}
                      </span>
                    </h4>
                    <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0">
                      {craft.people.map((person) => (
                        <div
                          key={person.id}
                          className="flex items-start gap-3 rounded-card border border-line-soft bg-surface p-4"
                        >
                          {/* Initials, not a photograph. Nobody on this
                              roster supplied one, and a stock portrait
                              standing in for a real tradesperson is a
                              picture of somebody else. */}
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-wash text-caption font-semibold text-accent">
                            {initialsOf(person.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-caption font-semibold text-ink">
                              {person.name}
                            </span>
                            {person.area && (
                              <span className="mt-0.5 block text-micro leading-snug text-muted">
                                {person.area}
                              </span>
                            )}
                            {person.availability && (
                              <span className="mt-0.5 block text-micro leading-snug text-faint">
                                {person.availability}
                              </span>
                            )}
                            <Link
                              href={`/services/${person.serviceSlug}`}
                              className="mt-1.5 inline-block text-micro font-medium text-accent hover:underline"
                            >
                              Book this trade
                            </Link>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---- Bespoke, said honestly ---------------------------- */}
          <section className="px-5 lg:px-0">
            <div className="rounded-card border border-line-soft bg-surface p-5">
              <h2 className="flex items-center gap-2 font-display text-title-sm font-semibold text-ink">
                <People className="size-5 text-accent" aria-hidden />
                Something genuinely one-off?
              </h2>
              <p className="mt-2 text-caption text-muted">
                Custom joinery, a commissioned piece, inlay or specialist metalwork — Quoin
                does not keep a public directory of named artisans, because that would mean
                publishing thirty people&rsquo;s details and ranking work we have not
                photographed. What we do instead is take the brief and match it ourselves.
                Describe the piece and an expert will come back with who can make it, what it
                will take and what it will cost.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button href="/consult" variant="primary" size="md">
                  Describe the piece
                </Button>
                <Button href="/premium" variant="outline" size="md">
                  Architectural Selects
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
