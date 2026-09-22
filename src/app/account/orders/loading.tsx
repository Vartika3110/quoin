import { AppShell } from "@/components/storefront/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Mirrors `OrderCard` (`src/components/storefront/orders/OrderCard.tsx`):
 * a header row, a thumbnail strip, two badges, a delivery line and a row
 * of action buttons — the shapes that would otherwise jump into place
 * once the real read lands. Reads Postgres twice per render
 * (`listOrdersForUser` and `countOrdersByTab`), so this is not a rare
 * frame.
 */
export default function Loading() {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-4 px-5 lg:px-0">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-7 w-64" />
        </div>

        <div className="px-5 lg:px-0 lg:flex lg:gap-10">
          <div className="hidden w-52 shrink-0 space-y-1 lg:block">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <Skeleton className="h-11 w-full rounded-none" />

            <ul className="space-y-3" role="status" aria-label="Loading orders">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="space-y-3 rounded-card border border-line-soft bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <div className="flex gap-2">
                    {Array.from({ length: 3 }, (_, j) => (
                      <Skeleton key={j} className="size-11 rounded-lg" />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20 rounded-md" />
                    <Skeleton className="h-5 w-24 rounded-md" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-9 w-24 rounded-lg" />
                    <Skeleton className="h-9 w-24 rounded-lg" />
                    <Skeleton className="h-9 w-20 rounded-lg" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
