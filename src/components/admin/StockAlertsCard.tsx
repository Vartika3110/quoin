import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { MarkContactedButton } from "@/components/admin/MarkContactedButton";
import { listStockAlertsForVariant } from "@/lib/data/stock-alerts";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Customers who asked to hear when this variant is back.
 *
 * On the item page because that is where stock is received: whoever
 * records the restock sees the callback list in the same place. Nothing
 * is sent automatically — see `src/lib/data/stock-alerts.ts` — so this
 * list is the whole notification system, worked by a person.
 *
 * Requests belong to the variant, not to this store, so the same list
 * shows on every store's item page for it.
 */
export async function StockAlertsCard({ variantId }: { variantId: string }) {
  const alerts = await listStockAlertsForVariant(variantId);
  const waiting = alerts.filter((a) => !a.contactedAt).length;

  return (
    <Card className="mt-6" padding="lg">
      <CardHeader
        title="Customers waiting"
        subtitle={
          alerts.length === 0
            ? "Nobody has asked to hear when this is back."
            : `${waiting} waiting to be contacted, oldest request first. Shared across every store for this variant.`
        }
      />

      {alerts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead className="text-left text-micro font-medium uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 text-ink">{a.customerName ?? "—"}</td>
                  <td className="nums px-3 py-2">
                    {a.phone ? (
                      <a href={`tel:${a.phone}`} className="text-accent">
                        {a.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {a.email ? (
                      <a href={`mailto:${a.email}`} className="text-accent">
                        {a.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="nums px-3 py-2 text-muted">
                    {dateFormatter.format(a.requestedAt)}
                  </td>
                  <td className="px-3 py-2">
                    {a.contactedAt ? (
                      <Badge tone="success">
                        Contacted {dateFormatter.format(a.contactedAt)}
                      </Badge>
                    ) : (
                      <MarkContactedButton alertId={a.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
