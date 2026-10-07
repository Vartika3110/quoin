import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Search } from "@/components/icons";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/data/order-history";
import { isRetiredStatus } from "@/lib/orders/lifecycle";

/**
 * The live statuses, retired ones last.
 *
 * `CONFIRMED`, `PROCESSING` and `PACKED` are retired — nothing can be
 * moved into them any more (see `src/lib/orders/lifecycle.ts`) — but they
 * are still *filterable*, because orders placed before the simplified
 * lifecycle shipped can still be sitting in them and finding those is the
 * one reason anybody would want the filter. Sorted to the bottom and
 * labelled, so the three nobody should be choosing are not mixed in with
 * the four they will use every day.
 */
const STATUSES = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).sort(
  (a, b) => Number(isRetiredStatus(a)) - Number(isRetiredStatus(b)),
);

const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[];

/**
 * The orders queue's filters.
 *
 * A plain GET form, not a client component: the result is a URL
 * (`/admin/orders?status=…&payment=…&vendor=…&from=…&to=…&q=…`), and a URL
 * is exactly what this phase asks for — linkable, sendable to a
 * colleague, and surviving a reload. No `onChange` auto-submit either, so
 * a staff member can pick a status *and* a vendor *and* type a search
 * term before any of it takes effect, rather than the page jumping out
 * from under a half-typed phone number.
 *
 * Every field is optional and every value is re-parsed server-side by a
 * forgiving parser (`parseOrderStatusFilter` and friends,
 * `src/lib/data/admin-orders.ts`), so a stale link with a status this app
 * no longer has shows the unfiltered queue rather than a 400.
 */
export function OrderStatusFilterForm({
  status,
  paymentStatus,
  vendorId,
  from,
  to,
  q,
  vendors,
}: {
  status: OrderStatus | undefined;
  paymentStatus: PaymentStatus | undefined;
  vendorId: string | undefined;
  /** `YYYY-MM-DD`, as submitted — echoed back rather than re-derived, so
      a half-filled range stays on the form after a reload. */
  from: string;
  to: string;
  q: string;
  vendors: { id: string; name: string }[];
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">Order status</span>
        <Select name="status" defaultValue={status ?? ""} className="w-44">
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {/* The retired three all *label* as "Placed" (see
                  `ORDER_STATUS_LABEL`), which is right everywhere a
                  status is shown and useless in a filter: three
                  identical options. This is the one screen where telling
                  them apart is the point, so they are named by the raw
                  status instead. */}
              {isRetiredStatus(value)
                ? `${ORDER_STATUS_LABEL[value]} — ${value.toLowerCase().replace(/_/g, " ")} (retired)`
                : ORDER_STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">Payment</span>
        <Select name="payment" defaultValue={paymentStatus ?? ""} className="w-40">
          <option value="">Any payment</option>
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PAYMENT_STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
      </label>

      {/* Only shown when there is more than one store to choose between —
          a single-store operator does not need a filter whose only value
          is "the one store". */}
      {vendors.length > 1 && (
        <label className="block">
          <span className="mb-1.5 block text-caption font-medium text-ink">Vendor</span>
          <Select name="vendor" defaultValue={vendorId ?? ""} className="w-44">
            <option value="">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </Select>
        </label>
      )}

      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">Placed from</span>
        <Input type="date" name="from" defaultValue={from} className="w-40" />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">to</span>
        <Input type="date" name="to" defaultValue={to} className="w-40" />
      </label>

      <label className="block min-w-48 max-w-sm flex-1">
        <span className="mb-1.5 block text-caption font-medium text-ink">Search</span>
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Reference, name or phone"
          aria-label="Search orders by reference, customer name or phone"
          leading={<Search className="size-4" />}
        />
      </label>

      <Button type="submit" variant="outline">
        Filter
      </Button>
    </form>
  );
}
