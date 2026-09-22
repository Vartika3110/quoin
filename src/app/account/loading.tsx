import { AppShell } from "@/components/storefront/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown while `/account` reads its overview.
 *
 * Mirrors the real page's shape — breadcrumb, header, the desktop rail and
 * six cards — rather than a generic spinner, so the page does not jump
 * once the data lands. Not `PageLoading`'s `"dashboard"` variant: that
 * shape was built for the old three-stat header this page no longer has,
 * and reworking it here would have changed what every other route using
 * that variant renders. See `AccountShell` for the real structure this
 * copies the measurements of.
 *
 * **Only on routes that cannot 404.** A `loading.tsx` wraps its segment in
 * a Suspense boundary, and Next flushes that shell before the page body
 * runs — a `notFound()` after that point can no longer set the status.
 * `/account` never calls `notFound()`, so this is safe.
 */
export default function Loading() {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Skeleton className="h-3 w-40" />
        </div>

        <div className="mb-4 px-5 lg:px-0">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>

        <div className="lg:flex lg:gap-10">
          <div className="hidden w-52 shrink-0 space-y-1 lg:block">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>

          <div className="min-w-0 flex-1 space-y-6 px-5 lg:px-0">
            <Skeleton className="h-24 w-full rounded-card" />

            <div
              role="status"
              aria-label="Loading your account"
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-4 rounded-card border border-line-soft bg-surface p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-lg" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
