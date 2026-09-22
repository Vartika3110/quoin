import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import {
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_TONE,
  type AdminSupportRow,
} from "@/lib/data/support";
import { SUPPORT_CATEGORIES } from "@/lib/support/faq";
import { SupportStatusForm } from "./SupportStatusForm";

const CATEGORY_LABEL = Object.fromEntries(
  SUPPORT_CATEGORIES.map((c) => [c.slug, c.label]),
) as Record<string, string>;

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * One request: a summary row that expands to the message, the customer
 * and the status control.
 *
 * `<details>`/`<summary>` rather than a table row — a table cannot host a
 * disclosure without inventing a second, hidden `<tr>`, and this is the
 * same primitive `Accordion` (`src/components/ui/Accordion.tsx`) is built
 * on. Hand-rolled rather than `Accordion` itself because its `title` is a
 * plain string and this summary needs badges and a truncated subject
 * alongside it.
 */
export function SupportRequestRow({ request }: { request: AdminSupportRow }) {
  return (
    <details className="group overflow-hidden rounded-card border border-line-soft bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-hover [&::-webkit-details-marker]:hidden">
        <span className="nums shrink-0 font-medium text-ink">{request.reference}</span>
        <Badge tone="neutral" size="sm">
          {CATEGORY_LABEL[request.category]}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{request.subject}</span>
        <span className="hidden shrink-0 text-caption text-muted sm:inline">
          {request.customerName ?? "Unnamed"}
        </span>
        <Badge tone={SUPPORT_STATUS_TONE[request.status]} size="sm">
          {SUPPORT_STATUS_LABEL[request.status]}
        </Badge>
      </summary>

      <div className="space-y-3 border-t border-line-hair px-4 py-4">
        <p className="whitespace-pre-line text-body-sm leading-relaxed text-ink">
          {request.message}
        </p>

        <dl className="grid gap-x-6 gap-y-1.5 text-caption text-muted sm:grid-cols-2">
          <div>
            <dt className="inline text-faint">Customer </dt>
            <dd className="inline">
              {request.customerName ?? "Unnamed"} ·{" "}
              {request.customerPhone ?? request.customerEmail ?? "No contact on file"}
            </dd>
          </div>
          <div>
            <dt className="inline text-faint">Filed </dt>
            <dd className="inline">{DATE_FORMAT.format(new Date(request.createdAt))}</dd>
          </div>
          {request.orderReference && (
            <div>
              <dt className="inline text-faint">Order </dt>
              <dd className="inline">
                <Link
                  href={`/admin/orders/${request.orderReference}`}
                  className="font-medium text-accent hover:text-accent-bright"
                >
                  {request.orderReference}
                </Link>
              </dd>
            </div>
          )}
          {request.bookingReference && (
            <div>
              <dt className="inline text-faint">Booking </dt>
              <dd className="inline">
                <Link
                  href={`/admin/services/${request.bookingReference}`}
                  className="font-medium text-accent hover:text-accent-bright"
                >
                  {request.bookingReference}
                </Link>
              </dd>
            </div>
          )}
        </dl>

        <SupportStatusForm reference={request.reference} status={request.status} />
      </div>
    </details>
  );
}
