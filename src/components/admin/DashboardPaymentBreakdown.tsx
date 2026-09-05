import type { PaymentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/Badge";
import { PAYMENT_STATUS_LABEL } from "@/lib/data/order-history";
import type { PaymentStatusCount } from "@/lib/data/admin-metrics";

/**
 * Today's payment attempts by gateway status.
 *
 * Labels are `PAYMENT_STATUS_LABEL` from `src/lib/data/order-history.ts` —
 * the account-side order detail already had to translate this exact enum,
 * and a second translation drifting from the first is how "Paid" on one
 * screen and "Captured" on another end up describing the same status.
 * Tone is the one thing that module does not export for this enum (it
 * only tones `OrderStatus`), so it is the only thing defined here.
 */
const TONE: Record<PaymentStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  CREATED: "warning",
  AUTHORIZED: "accent",
  CAPTURED: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export function DashboardPaymentBreakdown({
  breakdown,
}: {
  breakdown: PaymentStatusCount[];
}) {
  if (breakdown.length === 0) {
    return (
      <p className="text-body-sm text-muted">No payment attempts recorded yet today.</p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-3">
      {breakdown.map(({ status, count }) => (
        <li key={status} className="flex items-center gap-2">
          <Badge tone={TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>
          <span className="nums text-body-sm font-medium text-ink">{count}</span>
        </li>
      ))}
    </ul>
  );
}
