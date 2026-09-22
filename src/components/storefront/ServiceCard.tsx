import {
  Bolt,
  Building,
  Chevron,
  Hammer,
  Headset,
  Roller,
  Ruler,
  Shield,
  Sofa,
  Tap,
  Wrench,
} from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { ContentCard } from "@/components/ui/Card";
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
  inspection: Ruler,
  waterproofing: Shield,
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
    <ContentCard
      href={`/services/${service.slug}`}
      className={className}
      icon={<Icon className="size-5.5" />}
      badge={
        <Badge tone={service.bookingMode === "book" ? "success" : "info"} size="sm">
          {service.bookingMode === "book" ? "Book a day" : "Quote first"}
        </Badge>
      }
      title={service.name}
      subtitle={service.summary}
      /* The card owns the alignment, not this file: `h-full` plus a
         `flex-1` body is what puts "Pricing" on the same line across four
         cards whose summaries run to different lengths, and "See what is
         included" on one baseline under them. Four hand-tuned
         min-heights was the alternative and it survives exactly one copy
         change. */
      rows={[
        { term: "Pricing", detail: service.pricing },
        { term: "Timeline", detail: service.timeline },
      ]}
      footer={
        <span className="flex items-center gap-1 text-caption font-medium text-accent">
          See what is included
          <Chevron className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      }
    />
  );
}
