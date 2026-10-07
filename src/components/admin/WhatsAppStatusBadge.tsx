import { Badge } from "@/components/ui/Badge";
import type { OrderWhatsAppSummary } from "@/lib/data/whatsapp-notifications";

/**
 * The order queue's WhatsApp column, as one chip.
 *
 * Tones carry meaning here the way `Badge`'s own comment insists they
 * should: `danger` is a message that genuinely did not reach somebody and
 * needs a person, `warning` is one still in flight, and `neutral` is
 * "nothing has been sent yet", which for an unpaid order is correct
 * rather than a problem — so it is deliberately not `warning`.
 */
const TONE: Record<OrderWhatsAppSummary, "neutral" | "success" | "warning" | "danger"> = {
  none: "neutral",
  ok: "success",
  pending: "warning",
  failed: "danger",
};

const LABEL: Record<OrderWhatsAppSummary, string> = {
  none: "—",
  ok: "Sent",
  pending: "Sending",
  failed: "Failed",
};

export function WhatsAppStatusBadge({ summary }: { summary: OrderWhatsAppSummary }) {
  /* An order with nothing sent gets a plain dash rather than a chip: a
     column of grey "—" badges is visual noise on every unpaid row. */
  if (summary === "none") return <span className="text-faint">—</span>;

  return (
    <Badge tone={TONE[summary]} size="sm">
      {LABEL[summary]}
    </Badge>
  );
}
