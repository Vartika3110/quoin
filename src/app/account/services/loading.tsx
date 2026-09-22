import { AppShell } from "@/components/storefront/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors `ServiceBookingCard`: a title row with a status badge, a date
    line and a price line — the shapes that would otherwise jump into
    place once `listBookingsForUser` and the consultation read land. */
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

          <div className="min-w-0 flex-1 space-y-6">
            <div className="space-y-2.5" role="status" aria-label="Loading services">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="space-y-2 rounded-card border border-line-soft bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-md" />
                  </div>
                  <Skeleton className="h-3 w-36" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
