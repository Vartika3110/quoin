"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Accordion } from "@/components/ui/Accordion";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowRight, Briefcase, Calendar } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  bookingGroup,
  type BookingGroup,
} from "@/lib/services/booking-status";
import type { Project, ProjectService } from "@/lib/store/projects";

/** The half-day windows, keyed by the Prisma enum's own spelling —
    `ConsultSlot` in `src/lib/types/consult.ts` is a *different*,
    lower-snake vocabulary for the consultation domain, not this one. */
const SLOT_WINDOW: Record<string, string> = {
  MORNING: "9 am – 12 pm",
  AFTERNOON: "12 – 4 pm",
  EVENING: "4 – 8 pm",
};

const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const SCHEDULED_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function serviceWhen(service: ProjectService): string {
  if (service.scheduledAt) return SCHEDULED_FORMAT.format(new Date(service.scheduledAt));
  if (service.preferredDate) {
    const day = DAY_FORMAT.format(new Date(`${service.preferredDate}T00:00:00Z`));
    const window = service.preferredSlot ? SLOT_WINDOW[service.preferredSlot] : null;
    return window ? `${day}, ${window} (preferred)` : `${day} (preferred)`;
  }
  return "Date to be agreed";
}

function serviceCost(service: ProjectService): string {
  if (service.quotePaise != null) return formatPrice(service.quotePaise);
  if (service.status === "QUOTE_PENDING") return "Quote pending";
  return "—";
}

/**
 * The Services tab.
 *
 * Grouped by `bookingGroup` — the same state machine the booking's own
 * detail page reads — rather than a private grouping invented for this
 * card, so a booking never reads "upcoming" here and "in progress" there.
 */
export function ServicesPanel({ project }: { project: Project }) {
  if (project.services.length === 0) {
    return (
      <EmptyState
        icon={<Briefcase className="size-6" />}
        title="No services booked for this project yet"
        action={{ href: "/services", label: "Explore Services" }}
      >
        Professionals you book or ask a quote from against this project —
        installers, inspectors, contractors — collect here with their
        status and cost.
      </EmptyState>
    );
  }

  const groups: Record<BookingGroup, ProjectService[]> = {
    upcoming: [],
    in_progress: [],
    completed: [],
    cancelled: [],
  };
  for (const service of project.services) {
    groups[bookingGroup(service.status)].push(service);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button href={`/services/book?project=${project.id}`} size="sm">
          Book a service
        </Button>
        <Button href={`/services/book?project=${project.id}&mode=quote`} variant="outline" size="sm">
          Request a quote
        </Button>
      </div>

      <ServiceGroup title="Upcoming" services={groups.upcoming} />
      <ServiceGroup title="In progress" services={groups.in_progress} />
      <ServiceGroup title="Completed" services={groups.completed} />

      {groups.cancelled.length > 0 && (
        <Accordion
          title="Cancelled"
          subtitle={`${groups.cancelled.length} ${groups.cancelled.length === 1 ? "booking" : "bookings"}`}
        >
          <div className="space-y-3 px-4 pb-4">
            {groups.cancelled.map((service) => (
              <ServiceRow key={service.reference} service={service} />
            ))}
          </div>
        </Accordion>
      )}
    </div>
  );
}

function ServiceGroup({ title, services }: { title: string; services: ProjectService[] }) {
  if (services.length === 0) return null;
  return (
    <div>
      <h2 className="font-display text-title-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-3">
        {services.map((service) => (
          <li key={service.reference}>
            <ServiceRow service={service} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceRow({ service }: { service: ProjectService }) {
  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-sm font-semibold text-ink">{service.serviceName}</span>
            <Badge tone={BOOKING_STATUS_TONE[service.status]} size="sm">
              {BOOKING_STATUS_LABEL[service.status]}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-caption text-muted">
            <Calendar className="size-3.5 shrink-0" />
            {serviceWhen(service)}
          </p>
        </div>
        <span className="nums shrink-0 text-body-sm font-semibold text-ink">{serviceCost(service)}</span>
      </div>

      <Link
        href={`/account/services/${service.reference}`}
        className="mt-3 flex items-center gap-1 text-caption font-medium text-accent"
      >
        View details
        <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
}
