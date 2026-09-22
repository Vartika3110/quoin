import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Calendar } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";
import { formatBookingWhenFromView } from "@/lib/services/booking-helpers";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE } from "@/lib/services/booking-status";
import type { ServiceBookingListItem } from "@/lib/data/service-bookings";

/**
 * One booking or quote request, as a card — the account list's version of
 * `OrderCard`. Presentational only: every fact on it is already resolved
 * server-side by `listBookingsForUser`, so this never fetches anything of
 * its own.
 */
export function ServiceBookingCard({ booking }: { booking: ServiceBookingListItem }) {
  const when = formatBookingWhenFromView(booking);

  return (
    <Link
      href={`/account/services/${booking.reference}`}
      className="block rounded-card border border-line-soft bg-surface p-4 transition-colors hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-ink">{booking.serviceName}</p>
          <p className="nums mt-0.5 text-caption text-muted">
            {booking.reference}
            {booking.projectName ? ` · ${booking.projectName}` : ""}
          </p>
        </div>
        <Badge tone={BOOKING_STATUS_TONE[booking.status]} size="sm">
          {BOOKING_STATUS_LABEL[booking.status]}
        </Badge>
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-caption text-muted">
        <Calendar className="size-3.5 shrink-0" />
        {when ?? "Date to be agreed"}
      </p>

      {booking.quotePaise != null && (
        <p className="nums mt-1 text-caption font-medium text-ink">
          {formatPrice(booking.quotePaise)}
        </p>
      )}
    </Link>
  );
}
