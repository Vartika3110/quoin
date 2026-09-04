import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Badge";
import {
  ArrowRight,
  CheckCircle,
  Crown,
  Layers,
  Package,
  Rupee,
  Truck,
} from "@/components/icons";

/**
 * The two things that make Quoin more than a shop, and the closing
 * call to action.
 *
 * Kept in one file because they are the same kind of block — a full-width
 * band that interrupts the grid — and splitting them across three files
 * would make the shared measurements several decisions instead of one.
 */

/* ------------------------------------------------------------ project hub */

const HUB_POINTS = [
  {
    Icon: Rupee,
    title: "Budget that updates itself",
    detail: "Every order lands against the project, so spent and remaining are never guesses.",
  },
  {
    Icon: Package,
    title: "Deliveries on one calendar",
    detail: "Instant, scheduled and made-to-order items, with the dates each one actually has.",
  },
  {
    Icon: Layers,
    title: "One material list",
    detail: "Specified, ordered and delivered lines in a single place your contractor can read.",
  },
];

export function ProjectHubPromo() {
  return (
    <section className="overflow-hidden rounded-card border border-line-soft bg-surface lg:rounded-2xl">
      <div className="grid lg:grid-cols-2">
        <div className="order-2 p-6 lg:order-1 lg:p-10">
          <Eyebrow>Project Hub</Eyebrow>
          <h2 className="mt-3 text-headline font-semibold text-ink lg:text-headline-lg">
            A renovation is one project, not forty purchases.
          </h2>
          <p className="mt-4 max-w-md text-body leading-relaxed text-muted">
            Set a budget, list what the job needs, and let every order,
            booking and delivery file itself against the site it belongs to.
          </p>

          <ul className="mt-7 space-y-4">
            {HUB_POINTS.map(({ Icon, title, detail }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-ink">{title}</p>
                  <p className="mt-0.5 text-caption leading-relaxed text-muted">
                    {detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/projects/new">
              Start a project
              <ArrowRight className="size-4" />
            </Button>
            <Button href="/projects" variant="outline">
              See the hub
            </Button>
          </div>
        </div>

        {/* The photograph carries the right half at `lg` and becomes a
            banner above the copy on a phone, where a 50/50 split would
            leave both halves too small to do anything. */}
        <div className="relative order-1 aspect-3/2 lg:order-2 lg:aspect-auto lg:min-h-full">
          <Image
            src="/categories/cement-steel.webp"
            alt=""
            fill
            loading="lazy"
            sizes="(min-width: 1024px) 700px, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- quoin pro */

const PRO_BENEFITS = [
  "Trade pricing across the catalogue",
  "Priority dispatch on scheduled deliveries",
  "A dedicated project manager",
  "Bulk ordering and repeat orders",
];

export function ProPromo() {
  return (
    <section className="overflow-hidden rounded-card bg-deep p-6 lg:rounded-2xl lg:p-10">
      <div className="lg:flex lg:items-center lg:justify-between lg:gap-10">
        <div className="max-w-lg">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pro/15 px-3 py-1 text-eyebrow uppercase text-pro">
            <Crown className="size-3.5" />
            Quoin Pro
          </span>

          <h2 className="mt-4 text-headline font-semibold text-on-deep lg:text-headline-lg">
            Built for people who buy for a living.
          </h2>
          <p className="mt-3 text-body leading-relaxed text-on-deep/70">
            Architects, contractors and builders order differently — larger,
            more often, and against a deadline. Pro is priced and dispatched
            for that.
          </p>

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {PRO_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 size-4 shrink-0 text-pro" />
                <span className="text-caption leading-snug text-on-deep/85">
                  {benefit}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 shrink-0 lg:mt-0">
          <Button href="/pro" variant="pro" size="lg">
            See what Pro includes
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- final cta */

export function FinalCta() {
  return (
    <section className="rounded-card border border-accent-edge bg-accent-wash px-6 py-10 text-center lg:rounded-2xl lg:py-14">
      <h2 className="mx-auto max-w-lg text-headline font-semibold text-ink lg:text-headline-lg">
        Start your project with Quoin.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-body leading-relaxed text-muted">
        Price the materials, book the people, and keep the whole build in one
        place — from the first drawing to the last delivery.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button href="/projects/new" size="lg">
          Start a project
          <ArrowRight className="size-4" />
        </Button>
        <Button href="/consult" size="lg" variant="outline">
          Talk to an expert
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ parcha */

export function ParchaPromo() {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line-soft bg-surface p-6 sm:flex-row sm:items-center sm:justify-between lg:rounded-2xl lg:p-8">
      <div className="flex min-w-0 gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
          <Truck className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-title-sm font-semibold text-ink">
            Already have a materials list?
          </h2>
          <p className="mt-1 max-w-md text-body-sm leading-relaxed text-muted">
            Photograph a handwritten parcha or upload a supplier bill, and we
            will price it against the catalogue line by line.
          </p>
        </div>
      </div>
      <Button href="/upload" variant="outline" className="shrink-0">
        Upload a parcha
      </Button>
    </section>
  );
}
