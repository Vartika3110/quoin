import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Briefcase, Calendar, Ruler, Video } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listConsultRequestsForPhone } from "@/lib/data/consultations";
import {
  CONSULT_MODE_INFO,
  CONSULT_SLOT_LABEL,
  CONSULT_STATUS_LABEL,
  formatConsultDay,
  type ConsultStatus,
} from "@/lib/types/consult";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your services — Quoin" };

/** Status drives the chip's tone, so an open request reads differently
    from a finished one without anyone having to read the word. */
const STATUS_TONE: Record<ConsultStatus, "accent" | "info" | "success" | "neutral"> = {
  requested: "accent",
  scheduled: "info",
  completed: "success",
  cancelled: "neutral",
};

export default async function AccountServicesPage() {
  const session = await getSession();
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { phone: true },
      })
    : null;

  /* Matched on the number rather than the user id: consultations can be
     booked without an account, so someone who booked as a guest and signed
     in afterwards still sees theirs. */
  const requests = user ? await listConsultRequestsForPhone(user.phone) : [];

  return (
    <AccountShell
      current="/account/services"
      title="Services"
      subtitle="Consultations and site visits you have booked."
    >
      {!user ? (
        <SignInPrompt what="Signing in shows every consultation and site visit booked from your number." />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-6" />}
          title="Nothing booked yet"
          action={{ href: "/consult", label: "Talk to an expert" }}
          secondaryAction={{ href: "/services", label: "See all services" }}
        >
          A free video consultation is twenty minutes with someone who has
          built what you are building — with nothing to buy at the end of it.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
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
                    <p className="text-body-sm font-semibold text-ink">
                      {mode.title}
                    </p>
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
    </AccountShell>
  );
}
