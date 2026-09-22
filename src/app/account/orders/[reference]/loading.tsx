import { AppShell } from "@/components/storefront/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * This segment never calls `notFound()` — see the comment on
 * `[reference]/page.tsx` — so a `loading.tsx` here carries none of the
 * soft-404 risk `src/app/account/loading.tsx` warns about.
 */
export default function Loading() {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-4 px-5 lg:px-0">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-7 w-56" />
          <Skeleton className="mt-2 h-3 w-44" />
        </div>

        <div className="space-y-6 px-5 lg:px-0" role="status" aria-label="Loading order">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded-card border border-line-soft bg-surface p-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-4 w-20" />
              </div>
            ))}
          </div>
          <Skeleton className="h-56 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
        </div>
      </div>
    </AppShell>
  );
}
