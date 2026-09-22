import Link from "next/link";
import type { ServiceBookingStatus } from "@prisma/client";
import { cn } from "@/components/ui/cn";
import { BOOKING_STATUS_LABEL } from "@/lib/services/booking-status";

const STATUSES = Object.keys(BOOKING_STATUS_LABEL) as ServiceBookingStatus[];

/**
 * The service queue's status filter, as plain links — a filtered link is
 * one a colleague can be sent, and reloading it must show the same rows,
 * the same reasoning `OrderStatusFilterForm` gives its own `<form
 * method="get">`. Chips rather than a form here because there is only one
 * dimension to filter on — no free-text search alongside it yet.
 */
export function ServiceStatusChips({ status }: { status: ServiceBookingStatus | undefined }) {
  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Link
        href="/admin/services"
        className={cn(
          "shrink-0 rounded-full border px-3 py-1.5 text-caption transition-colors",
          !status
            ? "border-accent bg-accent-wash font-medium text-accent"
            : "border-line-soft bg-surface text-muted hover:border-line-strong",
        )}
      >
        All
      </Link>
      {STATUSES.map((value) => (
        <Link
          key={value}
          href={`/admin/services?status=${value}`}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-caption transition-colors",
            status === value
              ? "border-accent bg-accent-wash font-medium text-accent"
              : "border-line-soft bg-surface text-muted hover:border-line-strong",
          )}
        >
          {BOOKING_STATUS_LABEL[value]}
        </Link>
      ))}
    </div>
  );
}
