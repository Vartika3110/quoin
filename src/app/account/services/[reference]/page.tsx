import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { LoadError } from "@/components/storefront/account/LoadError";
import { ServiceBookingActions } from "@/components/storefront/services/ServiceBookingActions";
import { ServiceBookingFileRow } from "@/components/storefront/services/ServiceBookingFileRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Briefcase, Calendar, CheckCircle, Download } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { formatPrice } from "@/lib/types/catalog";
import { getBookingForUser, type ServiceBookingDetail } from "@/lib/data/service-bookings";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  nextBookingStatuses,
} from "@/lib/services/booking-status";
import { formatBookingWhenFromView } from "@/lib/services/booking-helpers";
import { PROJECT_KIND_LABEL } from "@/lib/store/projects";

export const dynamic = "force-dynamic";

type Params = { reference: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { reference } = await params;
  return { title: `${reference} — Quoin`, robots: { index: false, follow: false } };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * One booking or quote request, in full, for the customer who made it.
 *
 * Never calls `notFound()` — same reasoning as the order detail page: a
 * reference belonging to someone else and one that never existed both
 * resolve to `null` from `getBookingForUser`, and both get one in-page
 * empty state rather than a route-level 404.
 */
export default async function ServiceBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  const { reference } = await params;
  const sp = await searchParams;
  const justBooked = sp.booked === "1";

  if (!session) {
    return (
      <AccountShell current="/account/services" title="Service">
        <SignInPrompt
          what="Signing in shows this booking and everything else on your account."
          next={`/account/services/${reference}`}
        />
      </AccountShell>
    );
  }

  let booking: ServiceBookingDetail | null;
  try {
    booking = await getBookingForUser(session.userId, reference);
  } catch (error) {
    console.error("[account/services/detail] failed to load booking", error);
    return (
      <AccountShell current="/account/services" title="Service">
        <LoadError title="We couldn't load this booking." />
      </AccountShell>
    );
  }

  if (!booking) {
    return (
      <AccountShell current="/account/services" title="Service">
        <EmptyState
          icon={<Briefcase className="size-6" />}
          title="We couldn't find that booking"
          action={{ href: "/account/services", label: "Back to services" }}
        >
          It may belong to a different account, or the link may be out of date.
        </EmptyState>
      </AccountShell>
    );
  }

  const nextForCustomer = nextBookingStatuses(booking.status, "customer");
  const canAccept = nextForCustomer.includes("CONFIRMED");
  const canCancel = nextForCustomer.includes("CANCELLED");
  const when = formatBookingWhenFromView(booking);
  const hasDate = Boolean(booking.scheduledAt || booking.preferredDate);
  const siteLines = [booking.siteLine, [booking.siteCity, booking.sitePincode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <AccountShell current="/account/services" title={booking.serviceName} subtitle={booking.reference}>
      <div className="space-y-6">
        {justBooked && (
          <Card tone="accent" padding="lg">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                <CheckCircle className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-title-sm font-semibold text-ink">
                  {booking.kind === "BOOKING" ? "Service booked" : "Quote requested"}
                </p>
                <p className="mt-1 text-body-sm leading-relaxed text-muted">
                  Reference <span className="nums font-medium text-ink">{booking.reference}</span>{" "}
                  — {booking.serviceName}
                  {when ? `, ${when.toLowerCase()}` : ""}.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {booking.projectId && (
                <Button href={`/projects/${booking.projectId}`} variant="outline" size="sm">
                  View Project
                </Button>
              )}
              <Button href={`/services/${booking.serviceSlug}`} variant="outline" size="sm">
                View Service
              </Button>
              {hasDate && (
                <Button
                  href={`/api/v1/services/bookings/${booking.reference}/calendar`}
                  variant="outline"
                  size="sm"
                >
                  <Download className="size-4" />
                  Add to Calendar
                </Button>
              )}
            </div>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={BOOKING_STATUS_TONE[booking.status]}>
            {BOOKING_STATUS_LABEL[booking.status]}
          </Badge>
          {booking.projectName && (
            <Link href={`/projects/${booking.projectId}`} className="text-caption text-accent">
              {booking.projectName}
            </Link>
          )}
        </div>

        {booking.quotePaise != null && (
          <Card>
            <CardHeader title="Quote" />
            <p className="nums text-title-lg font-semibold text-ink">
              {formatPrice(booking.quotePaise)}
            </p>
            {booking.quoteNote && (
              <p className="mt-2 text-body-sm leading-relaxed text-muted">{booking.quoteNote}</p>
            )}
            <div className="mt-4">
              <ServiceBookingActions
                reference={booking.reference}
                canAccept={canAccept}
                canCancel={canCancel}
              />
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Visit" />
          <p className="flex items-center gap-2 text-body-sm text-ink">
            <Calendar className="size-4 shrink-0 text-muted" />
            {when ?? "To be agreed by phone"}
          </p>
          {!booking.scheduledAt && booking.preferredDate && (
            <p className="mt-1 text-caption text-muted">
              Preferred — we&rsquo;ll confirm the exact time by phone.
            </p>
          )}
        </Card>

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
            <div className="space-y-2">
              {booking.files.map((file) => (
                <ServiceBookingFileRow key={file.id} file={file} />
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Status history" subtitle="Newest last" />
          <ul className="space-y-3">
            {booking.statusHistory.map((change, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-body-sm">
                <span className="text-ink">{BOOKING_STATUS_LABEL[change.toStatus]}</span>
                <span className="text-caption text-muted">
                  {DATE_FORMAT.format(new Date(change.at))}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {booking.quotePaise == null && (canAccept || canCancel) && (
          <Card tone="sunk">
            <ServiceBookingActions
              reference={booking.reference}
              canAccept={canAccept}
              canCancel={canCancel}
            />
          </Card>
        )}

        <p className="text-caption text-muted">
          Something not right?{" "}
          <Link
            href={`/account/support?booking=${booking.reference}&category=services`}
            className="text-accent"
          >
            Get help
          </Link>
        </p>
      </div>
    </AccountShell>
  );
}
