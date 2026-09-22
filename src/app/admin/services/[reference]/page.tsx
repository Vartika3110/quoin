import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { ServiceBookingForm } from "@/components/admin/ServiceBookingForm";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { requireStaffPage } from "@/lib/auth/staff";
import { formatPrice } from "@/lib/types/catalog";
import { getBookingForStaff } from "@/lib/data/service-bookings";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  nextBookingStatuses,
} from "@/lib/services/booking-status";
import { formatBookingWhenFromView } from "@/lib/services/booking-helpers";
import { PROJECT_KIND_LABEL } from "@/lib/store/projects";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Service booking — Quoin",
  robots: { index: false, follow: false },
};

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type Ctx = { params: Promise<{ reference: string }> };

/**
 * One booking or quote request — everything a person on the phone with
 * this customer needs, matching the ambition `getAdminOrder` states for
 * an order: what it is, who asked, what has already been done to it, and
 * the one form that can move it further.
 */
export default async function AdminServiceBookingPage({ params }: Ctx) {
  await requireStaffPage();

  const { reference } = await params;
  const booking = await getBookingForStaff(reference);
  if (!booking) notFound();

  const nextStatusOptions = nextBookingStatuses(booking.status, "staff").map((value) => ({
    value,
    label: BOOKING_STATUS_LABEL[value],
  }));

  const siteLines = [
    booking.siteLine,
    [booking.siteCity, booking.sitePincode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AdminShell
      current="/admin/services"
      title={booking.reference}
      subtitle={`${booking.serviceName} · requested by ${booking.customerName ?? "an unnamed account"}`}
      actions={
        <Button href="/admin/services" variant="outline" size="sm">
          Back to services
        </Button>
      }
    >
      <Badge tone={BOOKING_STATUS_TONE[booking.status]} className="mb-6">
        {BOOKING_STATUS_LABEL[booking.status]}
      </Badge>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Site details" />
            <dl className="space-y-3 text-body-sm">
              {siteLines && (
                <div>
                  <dt className="text-micro text-muted">Address</dt>
                  <dd className="mt-0.5 text-ink">{siteLines}</dd>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {booking.projectKind && (
                  <div>
                    <dt className="text-micro text-muted">Project type</dt>
                    <dd className="mt-0.5 text-ink">{PROJECT_KIND_LABEL[booking.projectKind]}</dd>
                  </div>
                )}
                {booking.areaSqft != null && (
                  <div>
                    <dt className="text-micro text-muted">Approximate area</dt>
                    <dd className="nums mt-0.5 text-ink">{booking.areaSqft} sq ft</dd>
                  </div>
                )}
              </div>
              <div>
                <dt className="text-micro text-muted">Requirements</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink">{booking.requirements}</dd>
              </div>
              {booking.notes && (
                <div>
                  <dt className="text-micro text-muted">Additional notes</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-ink">{booking.notes}</dd>
                </div>
              )}
            </dl>
          </Card>

          {booking.files.length > 0 && (
            <Card>
              <CardHeader title="Files" subtitle={`${booking.files.length} attached`} />
              <ul className="space-y-2">
                {booking.files.map((file) => (
                  <li key={file.id} className="text-body-sm text-ink">
                    {file.originalName}
                    <span className="ml-2 text-caption text-muted">
                      {(file.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Status history" subtitle="Newest first" />
            {booking.statusHistory.length === 0 ? (
              <p className="text-body-sm text-muted">No moves recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {[...booking.statusHistory].reverse().map((change, i) => (
                  <li key={i} className="text-body-sm">
                    <p className="text-ink">
                      {change.fromStatus ? BOOKING_STATUS_LABEL[change.fromStatus] : "Created"} →{" "}
                      {BOOKING_STATUS_LABEL[change.toStatus]}
                    </p>
                    <p className="text-caption text-muted">
                      {DATE_TIME_FORMAT.format(new Date(change.at))} ·{" "}
                      {change.actorName ?? change.actorPhone ?? "Automated"}
                    </p>
                    {change.note && <p className="mt-1 text-caption text-muted">“{change.note}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card tone="sunk">
            <CardHeader title="Update booking" />
            <ServiceBookingForm
              reference={booking.reference}
              options={nextStatusOptions}
              currentQuotePaise={booking.quotePaise}
              currentQuoteNote={booking.quoteNote}
              currentScheduledAt={booking.scheduledAt}
            />
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <p className="text-body-sm text-ink">{booking.customerName ?? "Unnamed account"}</p>
            <p className="nums text-body-sm text-muted">
              {booking.customerPhone ?? booking.customerEmail ?? "—"}
            </p>
          </Card>

          <Card>
            <CardHeader title="Visit" />
            <p className="text-body-sm text-ink">{formatBookingWhenFromView(booking) ?? "—"}</p>
            {booking.projectName && (
              <p className="mt-2 text-caption text-muted">Project: {booking.projectName}</p>
            )}
          </Card>

          {booking.quotePaise != null && (
            <Card>
              <CardHeader title="Quote" />
              <p className="nums text-title font-semibold text-ink">
                {formatPrice(booking.quotePaise)}
              </p>
              {booking.quoteNote && (
                <p className="mt-2 text-body-sm text-muted">{booking.quoteNote}</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
