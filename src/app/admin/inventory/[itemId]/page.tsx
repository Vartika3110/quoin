import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { StockActions } from "@/components/admin/StockActions";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { requireStaffPage } from "@/lib/auth/staff";
import { one } from "@/lib/search-params";
import { getInventoryItemDetail, listInventoryMovements } from "@/lib/data/inventory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inventory item — Quoin",
  robots: { index: false, follow: false },
};

const MOVEMENT_LABEL: Record<string, string> = {
  RECEIPT: "Receipt",
  RESERVE: "Reserved",
  RELEASE: "Released",
  COMMIT: "Committed",
  ADJUSTMENT: "Adjustment",
  RETURN: "Return",
};

const MOVEMENT_TONE: Record<string, "success" | "warning" | "info" | "neutral" | "danger"> = {
  RECEIPT: "success",
  RESERVE: "warning",
  RELEASE: "neutral",
  COMMIT: "info",
  ADJUSTMENT: "danger",
  RETURN: "success",
};

/* Read down a phone line by staff, not a customer — IST is the one zone
   that matters for a movement made by someone standing in a store. */
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The audit trail for one item — the full `InventoryMovement` history,
 * newest first, rendered plainly rather than summarised. This is the
 * screen that answers "who changed this and why" six weeks later, so
 * every column the model carries is shown, not just the ones that read
 * nicely.
 */
export default async function InventoryItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const { itemId } = await params;
  const item = await getInventoryItemDetail(itemId);
  if (!item) notFound();

  const page = Number(one((await searchParams).page)) || 1;
  const movements = await listInventoryMovements(itemId, page);

  const available = item.onHandQty - item.reservedQty;

  return (
    <AdminShell
      current="/admin/inventory"
      title={item.productName}
      subtitle={`${item.variantLabel} · ${item.variantSku} · ${item.storeName}`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="On hand" value={item.onHandQty} />
        <Stat label="Reserved" value={item.reservedQty} />
        <Stat
          label="Available"
          value={available}
          tone={available <= item.lowStockThreshold ? "accent" : "plain"}
        />
        <Stat label="Low-stock threshold" value={item.lowStockThreshold} />
      </div>

      <Card className="mt-6" padding="lg">
        <CardHeader
          title="Stock actions"
          subtitle="Every action here writes to the movement history below."
        />
        <StockActions itemId={item.id} />
      </Card>

      <Card className="mt-6" padding="lg">
        <CardHeader
          title="Movement history"
          subtitle={`${movements.total} movement${movements.total === 1 ? "" : "s"}, newest first`}
        />

        {movements.items.length === 0 ? (
          <p className="text-body-sm text-muted">No movements recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="text-left text-micro font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">On hand after</th>
                  <th className="px-3 py-2 text-right">Reserved after</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {movements.items.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2">
                      <Badge tone={MOVEMENT_TONE[m.kind] ?? "neutral"}>
                        {MOVEMENT_LABEL[m.kind] ?? m.kind}
                      </Badge>
                    </td>
                    <td className="nums px-3 py-2 text-right">{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                    <td className="nums px-3 py-2 text-right">{m.onHandQty}</td>
                    <td className="nums px-3 py-2 text-right">{m.reservedQty}</td>
                    <td className="px-3 py-2 text-muted">
                      {m.orderReference ? (
                        <Link href={`/admin/orders/${m.orderReference}`} className="text-accent">
                          {m.orderReference}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted">{m.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{m.staffUserName ?? "—"}</td>
                    <td className="nums px-3 py-2 text-muted">
                      {dateFormatter.format(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {movements.totalPages > 1 && (
          <nav className="mt-4 flex items-center justify-center gap-4 text-caption">
            {page > 1 ? (
              <Link href={`/admin/inventory/${itemId}?page=${page - 1}`} className="text-accent">
                Previous
              </Link>
            ) : (
              <span className="text-faint">Previous</span>
            )}
            <span className="text-muted">
              Page {page} of {movements.totalPages}
            </span>
            {page < movements.totalPages ? (
              <Link href={`/admin/inventory/${itemId}?page=${page + 1}`} className="text-accent">
                Next
              </Link>
            ) : (
              <span className="text-faint">Next</span>
            )}
          </nav>
        )}
      </Card>
    </AdminShell>
  );
}
