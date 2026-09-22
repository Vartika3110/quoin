import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Headset } from "@/components/icons";
import { SUPPORT_CATEGORIES } from "@/lib/support/faq";
import {
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_TONE,
  type SupportRequestView,
} from "@/lib/data/support";

const CATEGORY_LABEL = Object.fromEntries(
  SUPPORT_CATEGORIES.map((c) => [c.slug, c.label]),
) as Record<string, string>;

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "Your requests" — every conversation this account has opened, newest
    first, with the same status vocabulary the admin queue uses. */
export function SupportRequestList({ requests }: { requests: SupportRequestView[] }) {
  if (requests.length === 0) {
    return (
      <EmptyState icon={<Headset className="size-6" />} title="No requests yet" compact>
        Once you send a message here, it shows up in this list with its status.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.reference} className="rounded-card border border-line-soft bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-ink">{r.subject}</p>
              <p className="mt-0.5 text-caption text-muted">
                {CATEGORY_LABEL[r.category]}
                {r.orderReference && ` · Order ${r.orderReference}`}
                {r.bookingReference && ` · Booking ${r.bookingReference}`}
              </p>
            </div>
            <Badge tone={SUPPORT_STATUS_TONE[r.status]} size="sm">
              {SUPPORT_STATUS_LABEL[r.status]}
            </Badge>
          </div>
          <p className="nums mt-2 text-micro text-faint">
            {r.reference} · {DATE_FORMAT.format(new Date(r.createdAt))}
          </p>
        </div>
      ))}
    </div>
  );
}
