import { AppShell } from "@/components/storefront/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";

/**
 * The shape of a page that has not arrived.
 *
 * Route-level `loading.tsx` files across the app render this rather than a
 * spinner, because a skeleton at the right size is what stops the page
 * jumping when the content lands. The variants exist so a browse page does
 * not flash a product-detail shape on its way in.
 *
 * The shell itself renders normally: the header, nav and footer come from
 * queries that are already cached and there is no reason to make the
 * customer watch them load twice.
 */
export function PageLoading({
  variant = "grid",
}: {
  variant?: "grid" | "detail" | "dashboard" | "prose";
}) {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-4 px-5 lg:px-0">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-7 w-64" />
        </div>

        {variant === "grid" && <GridBody />}
        {variant === "detail" && <DetailBody />}
        {variant === "dashboard" && <DashboardBody />}
        {variant === "prose" && <ProseBody />}
      </div>
    </AppShell>
  );
}

function GridBody() {
  return (
    <div className="lg:flex lg:gap-8" role="status" aria-label="Loading">
      <div className="hidden w-60 shrink-0 space-y-6 lg:block">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: 4 }, (_, j) => (
              <Skeleton key={j} className="h-8 w-full" />
            ))}
          </div>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between px-5 lg:px-0">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-3 lg:px-0 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-card border border-line-soft bg-surface"
            >
              <Skeleton className="aspect-square rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailBody() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12"
    >
      <Skeleton className="aspect-square rounded-none lg:rounded-card" />
      <div className="space-y-4 px-5 pt-6 lg:px-0 lg:pt-0">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-20 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-13 w-full rounded-lg" />
        <Skeleton className="h-13 w-full rounded-lg" />
      </div>
    </div>
  );
}

function DashboardBody() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6 px-5 lg:px-0">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-card border border-line-soft bg-surface p-4">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-3 h-6 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
      </div>
    </div>
  );
}

function ProseBody() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 px-5 lg:px-0">
      {[
        "w-full",
        "w-11/12",
        "w-full",
        "w-4/5",
        "w-full",
        "w-3/5",
      ].map((width, i) => (
        <Skeleton key={i} className={cn("h-4", width)} />
      ))}
      <Skeleton className="mt-8 h-40 w-full rounded-card" />
    </div>
  );
}
