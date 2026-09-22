import type { SupportStatus } from "@prisma/client";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SUPPORT_STATUS_LABEL } from "@/lib/data/support";

const STATUSES = Object.keys(SUPPORT_STATUS_LABEL) as SupportStatus[];

/**
 * The support queue's filter. A plain GET form, matching
 * `OrderStatusFilterForm` (`src/components/admin/OrderStatusFilterForm.tsx`)
 * — the result is a URL a colleague can be sent, and reloading it shows
 * the same rows. Colocated with the page rather than in
 * `src/components/admin/`, which this slice does not own.
 */
export function SupportStatusFilterForm({ status }: { status: SupportStatus | undefined }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">Status</span>
        <Select name="status" defaultValue={status ?? ""} className="w-48">
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {SUPPORT_STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
      </label>

      <Button type="submit" variant="outline">
        Filter
      </Button>
    </form>
  );
}
