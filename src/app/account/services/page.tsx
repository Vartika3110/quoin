import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { LoadError } from "@/components/storefront/account/LoadError";
import { ServiceBookingCard } from "@/components/storefront/services/ServiceBookingCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Briefcase, Calendar, Ruler, Video } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listBookingsForUser, type ServiceBookingListItem } from "@/lib/data/service-bookings";
import { bookingGroup, type BookingGroup } from "@/lib/services/booking-status";
import {
  listConsultRequestsForPhone,
  listConsultRequestsForUser,
} from "@/lib/data/consultations";
import {
  CONSULT_MODE_INFO,
  CONSULT_SLOT_LABEL,
  CONSULT_STATUS_LABEL,
  formatConsultDay,
  type ConsultRequestView,
  type ConsultStatus,
} from "@/lib/types/consult";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your services — Quoin" };

const STATUS_TONE: Record<ConsultStatus, "accent" | "info" | "success" | "neutral"> = {
  requested: "accent",
  scheduled: "info",
  completed: "success",
  cancelled: "neutral",
};

const GROUP_ORDER: { group: BookingGroup; label: string }[] = [
  { group: "upcoming", label: "Upcoming" },
  { group: "in_progress", label: "In progress" },
  { group: "completed", label: "Completed" },
  { group: "cancelled", label: "Cancelled" },
];

export default async function AccountServicesPage() {
  const session = await getSession();

  if (!session) {
    return (
      <AccountShell
        current="/account/services"
        title="Services"
        subtitle="Bookings, quotes and callback requests."
      >
        <SignInPrompt
          what="Signing in shows every service you have booked or asked to be quoted."
          next="/account/services"
        />
      </AccountShell>
    );
  }

  let bookings: ServiceBookingListItem[];
  let consultations: ConsultRequestView[];
  try {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { phone: true },
    });

    [bookings, consultations] = await Promise.all([
      listBookingsForUser(session.userId),
      /* Same matching rule the page used before this rebuild — see the
         comment on `listConsultRequestsForUser`: a Google account with no
         phone has only the account link to go on. */
      user?.phone
        ? listConsultRequestsForPhone(user.phone)
        : listConsultRequestsForUser(session.userId),
    ]);
  } catch (error) {
    console.error("[account/services] failed to load", error);
    return (
      <AccountShell current="/account/services" title="Services">
        <LoadError title="We couldn't load your services." />
      </AccountShell>
    );
  }

  const grouped = new Map<BookingGroup, ServiceBookingListItem[]>();
  for (const booking of bookings) {
    const group = bookingGroup(booking.status);
    grouped.set(group, [...(grouped.get(group) ?? []), booking]);
  }

  const nothingAtAll = bookings.length === 0 && consultations.length === 0;

  return (
    <AccountShell
      current="/account/services"
      title="Services"
      subtitle="Bookings, quotes and callback requests."
    >
      {nothingAtAll ? (
        <EmptyState
          icon={<Briefcase className="size-6" />}
          title="No services booked yet."
          action={{ href: "/services", label: "Explore Services" }}
        >
          Book a professional to a preferred day, or request a quote for
          work that needs to be seen first.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {bookings.length > 0 && (
            <div className="space-y-6">
              {GROUP_ORDER.filter(({ group }) => (grouped.get(group)?.length ?? 0) > 0).map(
                ({ group, label }) => (
                  <div key={group}>
                    <h2 className="mb-2 text-body-sm font-semibold text-ink">{label}</h2>
                    <ul className="space-y-2.5">
                      {grouped.get(group)!.map((booking) => (
                        <li key={booking.reference}>
                          <ServiceBookingCard booking={booking} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}

          <div>
            <h2 className="mb-2 text-body-sm font-semibold text-ink">Callback requests</h2>
            {consultations.length === 0 ? (
              <EmptyState
                compact
                icon={<Briefcase className="size-6" />}
                title="No callback requests yet"
                action={{ href: "/consult", label: "Talk to an expert" }}
              >
                A free video consultation is twenty minutes with someone who
                has built what you are building.
              </EmptyState>
            ) : (
              <ul className="space-y-2.5">
                {consultations.map((request) => {
                  const mode = CONSULT_MODE_INFO[request.mode];
                  const Icon = request.mode === "video" ? Video : Ruler;
                  return (
                    <li
                      key={request.reference}
                      className="flex gap-4 rounded-card border border-line-soft bg-surface p-4"
                    >
                      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
                        <Icon className="size-5" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-body-sm font-semibold text-ink">{mode.title}</p>
                          <Badge tone={STATUS_TONE[request.status]} size="sm">
                            {CONSULT_STATUS_LABEL[request.status]}
                          </Badge>
                        </div>

                        <p className="nums mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
                          <span className="font-mono">{request.reference}</span>
                          {request.preferredDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {formatConsultDay(request.preferredDate)}
                              {request.preferredSlot &&
                                ` · ${CONSULT_SLOT_LABEL[request.preferredSlot]}`}
                            </span>
                          )}
                          {request.areaName && <span>{request.areaName}</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </AccountShell>
  );
}
