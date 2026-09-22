import { AppShell } from "@/components/storefront/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Mirrors the real page: the account rail, eight category tiles, a run of
 * closed FAQ rows, the contact form and a couple of request rows — the
 * shapes that would otherwise jump into place once `listSupportRequestsForUser`
 * lands. Matches the shape `src/app/account/orders/loading.tsx` uses for
 * the same rail, rather than the generic `PageLoading` dashboard variant.
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

          <div className="min-w-0 flex-1 space-y-8" role="status" aria-label="Loading">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-card" />
              ))}
            </div>

            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-card" />
              ))}
            </div>

            <div className="max-w-xl space-y-4">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-11 w-32 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
