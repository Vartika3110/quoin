import { cn } from "@/components/ui/cn";

/**
 * Loading placeholders.
 *
 * The rule these follow: a skeleton is the shape of the thing that is
 * coming, at the size it will be. A generic grey box that then gets
 * replaced by a taller card makes the page jump, which is the exact
 * problem a skeleton exists to prevent — so every skeleton here mirrors a
 * real component's measurements rather than approximating them.
 */

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("skeleton block rounded-md", className)} aria-hidden />;
}

/** Mirrors `ProductCard`: square image, price line, three lines of title. */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line-soft bg-surface">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div
      /* Announced once, not per tile — twenty "loading" messages in a row
         is what makes a screen reader unusable on a slow connection. */
      role="status"
      aria-label="Loading products"
      className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0 xl:grid-cols-5"
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Mirrors `CategoryTile`: a 4:5 photograph with type over the foot. */
export function CategoryTileSkeleton() {
  return <Skeleton className="aspect-4/5 rounded-card" />;
}

export function CategoryGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading categories"
      className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-4 lg:px-0"
    >
      {Array.from({ length: count }, (_, i) => (
        <CategoryTileSkeleton key={i} />
      ))}
    </div>
  );
}

/** A stack of rows — orders, deliveries, documents, saved specifications. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-card border border-line-soft bg-surface p-4"
        >
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** The summary cards at the head of a dashboard. */
export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading summary"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-card border border-line-soft bg-surface p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the product detail page above the fold. */
export function ProductDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading product" className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
      <Skeleton className="aspect-square rounded-none lg:rounded-card" />
      <div className="space-y-4 px-5 pt-5 lg:px-0 lg:pt-0">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-20 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}
