import type { OrderStatus } from "@prisma/client";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Search } from "@/components/icons";
import { ORDER_STATUS_LABEL } from "@/lib/data/order-history";
import { isRetiredStatus } from "@/lib/orders/lifecycle";

/**
 * The statuses worth offering as a filter.
 *
 * Not every `OrderStatus`, which is what this was, and the difference
 * was visible rather than theoretical: `CONFIRMED`, `PROCESSING` and
 * `PACKED` are retired, and every retired status is deliberately
 * labelled "Placed" wherever a status is *shown* — so the dropdown
 * listed **four options all reading "Placed"**, three of which can never
 * match anything a new order reaches. Picking the wrong one answered
 * "0 orders — Placed" while placed orders existed, which reads as an
 * empty queue rather than as a filter that cannot match.
 *
 * Mapping a retired status to "placed" is right for display, because an
 * order that is historically `PACKED` is, to a customer and to staff, a
 * placed order. It is wrong for a *filter*, because a filter is a
 * question and these three are a question nobody can mean to ask.
 *
 * Read from `isRetiredStatus` rather than listed here, so the retired
 * set keeps one home — the same source `isAdminTransitionAllowed` uses
 * to stop a new order ever arriving in one.
 */
const STATUSES = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).filter(
  (status) => !isRetiredStatus(status),
);

/**
 * The orders queue's filters.
 *
 * A plain GET form, not a client component: the result is a URL
 * (`/admin/orders?status=...&q=...`), and a URL is exactly what
 * `AGENTS.md` for this phase asks for — "linkable and survives a reload".
 * No `onChange` auto-submit either, so a staff member can pick a status
 * *and* type a search term before either takes effect, rather than the
 * page jumping out from under a half-typed phone number.
 */
export function OrderStatusFilterForm({
  status,
  q,
}: {
  status: OrderStatus | undefined;
  q: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">Status</span>
        <Select name="status" defaultValue={status ?? ""} className="w-48">
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
      </label>

      <label className="block flex-1 min-w-48 max-w-sm">
        <span className="mb-1.5 block text-caption font-medium text-ink">Search</span>
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Reference or phone number"
          aria-label="Search orders by reference or customer phone"
          leading={<Search className="size-4" />}
        />
      </label>

      <Button type="submit" variant="outline">
        Filter
      </Button>
    </form>
  );
}
