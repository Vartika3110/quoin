import Link from "next/link";
import {
  Bolt,
  Building,
  Chevron,
  Hammer,
  Headset,
  Roller,
  Sofa,
  Tap,
  Wrench,
} from "@/components/icons";
import { cn } from "@/components/ui/cn";
import type { Service, ServiceIcon } from "@/lib/data/services";

/**
 * One service, as a card.
 *
 * No rating, no professional's name, no "from ₹X". None of those three
 * exist as data, and a card that shows a made-up 4.8 next to a real
 * catalogue is worse than a card that shows neither: it teaches the
 * customer that the numbers on this site are decorative.
 *
 * What it does carry is the two things that are true and decision-shaped —
 * how the fee is arrived at, and how long the work takes.
 */

const ICON: Record<ServiceIcon, typeof Building> = {
  architect: Building,
  interior: Sofa,
  electrical: Bolt,
  plumbing: Tap,
  painting: Roller,
  civil: Hammer,
  installation: Wrench,
  consultation: Headset,
};

export function ServiceCard({
  service,
  className,
}: {
  service: Service;
  className?: string;
}) {
  const Icon = ICON[service.icon];

  return (
    <Link
      href={`/services/${service.slug}`}
      className={cn(
        "group flex flex-col rounded-card border border-line-soft bg-surface p-5 transition-[transform,box-shadow,border-color] duration-200 ease-out-quart hover:-translate-y-0.5 hover:border-line hover:shadow-md",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-lg bg-accent-wash text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
        <Icon className="size-5.5" />
      </span>

      <h3 className="mt-4 text-title-sm font-semibold text-ink">{service.name}</h3>
      <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
        {service.summary}
      </p>

      <dl className="mt-4 space-y-1 border-t border-line-hair pt-3 text-micro">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-faint">Pricing</dt>
          <dd className="min-w-0 flex-1 text-muted">{service.pricing}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-faint">Timeline</dt>
          <dd className="min-w-0 flex-1 text-muted">{service.timeline}</dd>
        </div>
      </dl>

      <span className="mt-4 flex items-center gap-1 text-caption font-medium text-accent">
        See what is included
        <Chevron className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
