import Link from "next/link";
import type { Metadata } from "next";
import type { ServiceBookingStatus } from "@prisma/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { ServiceStatusChips } from "@/components/admin/ServiceStatusChips";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Briefcase } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { one } from "@/lib/search-params";
import { maskPhone } from "@/lib/auth/phone";
import { listBookingsForStaff } from "@/lib/data/service-bookings";
import { formatBookingWhenFromView } from "@/lib/services/booking-helpers";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE } from "@/lib/services/booking-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Services — Quoin",
  robots: { index: false, follow: false },
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const STATUS_VALUES: ReadonlySet<string> = new Set(Object.keys(BOOKING_STATUS_LABEL));

function parseStatusFilter(value: string | undefined): ServiceBookingStatus | undefined {
  return value && STATUS_VALUES.has(value) ? (value as ServiceBookingStatus) : undefined;
}

/**
 * The service queue — every booking and quote request, newest first.
 *
 * `?status=` is a plain query param, matching `/admin/orders`: a filtered
 * link is a link a colleague can be sent, and reloading it must show the
 * same rows.
 */
export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const sp = await searchParams;
  const status = parseStatusFilter(one(sp.status));
  const page = Number(one(sp.page)) || undefined;

  const { items, total, totalPages, page: currentPage } = await listBookingsForStaff({
    status,
    page,
  });

  const filterQuery = status ? `status=${status}&` : "";

  return (
    <AdminShell
      current="/admin/services"
      title="Services"
      subtitle={`${total} booking${total === 1 ? "" : "s"}${status ? ` — ${BOOKING_STATUS_LABEL[status]}` : ""}.`}
    >
      <ServiceStatusChips status={status} />

      {items.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-6" />}
          title={status ? "No booking matches this filter." : "No services booked yet."}
          className="mt-6"
        >
          {status && (
            <Link href="/admin/services" className="text-accent">
              Clear filter
            </Link>
          )}
        </EmptyState>
      ) : (
        <Card className="mt-6 overflow-hidden" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-line-soft bg-sunk text-micro uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Visit</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.reference}
                    className="border-b border-line-hair last:border-0 hover:bg-hover"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/services/${row.reference}`}
                        className="nums font-medium text-ink hover:text-accent"
                      >
                        {row.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{row.serviceName}</td>
                    <td className="px-4 py-3">
                      <span className="block text-ink">{row.customerName ?? "Unnamed"}</span>
                      <span className="nums block text-caption text-muted">
                        {row.customerPhone ? maskPhone(row.customerPhone) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{row.projectName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatBookingWhenFromView(row) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={BOOKING_STATUS_TONE[row.status]} size="sm">
                        {BOOKING_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {DATE_FORMAT.format(new Date(row.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3">
          {currentPage > 1 ? (
            <Button
              href={`/admin/services?${filterQuery}page=${currentPage - 1}`}
              variant="outline"
              size="sm"
            >
              Previous
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          <span className="nums text-caption text-muted">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Button
              href={`/admin/services?${filterQuery}page=${currentPage + 1}`}
              variant="outline"
              size="sm"
            >
              Next
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </nav>
      )}
    </AdminShell>
  );
}
