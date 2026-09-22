import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Briefcase } from "@/components/icons";
import { plural } from "@/lib/account/greeting";
import { formatBookingWhen } from "@/lib/services/booking-helpers";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE } from "@/lib/services/booking-status";
import { DashboardCardHead } from "@/components/storefront/account/dashboard/DashboardCardHead";
import type { AccountOverviewService } from "@/lib/data/account-overview";

export function ServicesCard({
  upcomingServiceCount,
  nextService,
}: {
  upcomingServiceCount: number;
  nextService: AccountOverviewService | null;
}) {
  return (
    <Card padding="lg" className="anim-rise flex h-full flex-col">
      <DashboardCardHead icon={<Briefcase className="size-4.5" />} title="Services" />

      {upcomingServiceCount === 0 || !nextService ? (
        <>
          <p className="mt-3 flex-1 text-body-sm leading-relaxed text-muted">
            No services booked yet.
          </p>
          <Button href="/services" variant="outline" size="sm" className="mt-4 self-start">
            Explore Services
          </Button>
        </>
      ) : (
        <>
          <p className="nums mt-3 text-title-sm font-semibold text-ink">
            {upcomingServiceCount}{" "}
            {plural(upcomingServiceCount, "Upcoming Service", "Upcoming Services")}
          </p>

          <div className="mt-4 flex-1 space-y-2 border-t border-line-hair pt-4">
            <p className="truncate text-body-sm font-medium text-ink">{nextService.serviceName}</p>
            <p className="text-caption text-muted">
              {formatBookingWhen({
                scheduledAt: nextService.scheduledAt ? new Date(nextService.scheduledAt) : null,
                preferredDate: nextService.preferredDate ? new Date(nextService.preferredDate) : null,
                preferredSlot: nextService.preferredSlot,
              }) ?? "Date to be agreed"}
            </p>
            <Badge tone={BOOKING_STATUS_TONE[nextService.status]} size="sm">
              {BOOKING_STATUS_LABEL[nextService.status]}
            </Badge>
          </div>

          <Button
            href={`/account/services/${nextService.reference}`}
            variant="outline"
            size="sm"
            className="mt-4 self-start"
          >
            View Service
          </Button>
        </>
      )}
    </Card>
  );
}
