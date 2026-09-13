import Link from "next/link";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";
import { BoardCard } from "@/components/admin/BoardCard";
import { BoardAutoRefresh } from "@/components/admin/BoardAutoRefresh";
import { cn } from "@/components/ui/cn";
import { requireStaffPage } from "@/lib/auth/staff";
import { formatPrice } from "@/lib/types/catalog";
import { getOrderBoard } from "@/lib/data/admin-board";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order board — Quoin",
  robots: { index: false, follow: false },
};

const UPDATED_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Every order by stage, one tap to move it along — the restaurant-app
 * queue the owner asked for, sitting beside the filterable table
 * `/admin/orders` already is rather than replacing it. Read-mostly: the
 * one write this page makes is `BoardAdvanceButton`'s POST to the
 * existing status route, everything else here is `getOrderBoard`'s read
 * rendered as columns.
 */
export default async function AdminOrderBoardPage() {
  await requireStaffPage();

  const now = new Date();
  const board = await getOrderBoard(now);

  return (
    <AdminShell
      current="/admin/orders/board"
      title="Order board"
      subtitle="Every order, by stage. Tap a card to move it forward."
      actions={
        <Button href="/admin/orders" variant="outline" size="sm">
          Full order list
        </Button>
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-caption text-muted">Updated {UPDATED_FORMAT.format(now)}</p>
        <BoardAutoRefresh />
      </div>

      <div
        className={cn(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2",
          "[scrollbar-width:thin] lg:grid lg:snap-none lg:grid-cols-6 lg:overflow-visible",
        )}
      >
        {board.columns.map((column) => {
          const deemphasised = column.key === "cancelled";
          return (
            <section
              key={column.key}
              className={cn(
                "w-[82vw] shrink-0 snap-start sm:w-[45vw] lg:w-auto lg:shrink",
                deemphasised && "opacity-70",
              )}
            >
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-display text-title-sm font-semibold text-ink">
                  {column.label}
                </h2>
                <span className="nums shrink-0 text-caption text-muted">
                  {column.count} · {formatPrice(column.totalPaise)}
                </span>
              </div>

              <div className="space-y-3">
                {column.items.length === 0 ? (
                  <p className="text-caption text-faint">No orders here</p>
                ) : (
                  column.items.map((card) => (
                    <BoardCard key={card.reference} card={card} now={now} muted={deemphasised} />
                  ))
                )}

                {column.moreCount > 0 && (
                  <Link
                    href={`/admin/orders?status=${column.overflowStatus}`}
                    className="block text-center text-caption text-accent"
                  >
                    +{column.moreCount} more
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </AdminShell>
  );
}
