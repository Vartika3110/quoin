import { AppShell } from "@/components/storefront/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The shape of a Studio page that has not arrived.
 *
 * Deliberately not `PageLoading`: a Studio route has a masthead, a nav
 * rail and a ragged grid, and a skeleton of a product listing resolving
 * into a masonry feed is a layout shift dressed up as a loading state.
 *
 * The column ratios below are the same cycle `MasonrySkeleton` uses, so
 * the fallback and the client-side skeleton agree with each other.
 *
 * **Only on routes that cannot 404.** A `loading.tsx` wraps its segment
 * *and every segment below it* in a Suspense boundary, and Next commits
 * HTTP 200 when that shell flushes — so a `notFound()` after it can no
 * longer set the status and the route answers 200 with 404 content.
 * `/studio/idea/[slug]` and `/studio/spaces/[id]` both call `notFound()`,
 * which is why there is no `loading.tsx` at `/studio` itself and only
 * leaf routes have one. Same rule, and same reason, as the comment in
 * `src/app/products/loading.tsx`.
 */
const RATIOS = [1.4, 1, 0.7, 1.25, 0.8, 1.55, 1.1, 0.9];

export function StudioLoading({ columns = 4 }: { columns?: number }) {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-6 px-5 lg:mb-8 lg:px-0">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-72" />
          <Skeleton className="mt-3 h-4 w-full max-w-md" />
          <Skeleton className="mt-5 h-12 w-full max-w-xl rounded-full" />
        </div>

        <div className="flex gap-8 lg:gap-10">
          <div className="hidden w-52 shrink-0 flex-col gap-2 lg:flex">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>

          <div className="min-w-0 flex-1 px-5 lg:px-0">
            <div className="mb-5 flex gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-full" />
              ))}
            </div>

            <div className="flex items-start gap-3 lg:gap-4">
              {Array.from({ length: columns }, (_, column) => (
                <div key={column} className="flex min-w-0 flex-1 flex-col gap-3 lg:gap-4">
                  {Array.from({ length: 3 }, (_, row) => (
                    /* The `skeleton` class directly rather than the
                       `Skeleton` component, which takes only a
                       `className` — and a per-tile aspect ratio is
                       exactly the value Tailwind's static extraction
                       cannot see, so it has to be inline. Same shape
                       `MasonrySkeleton` uses on the client. */
                    <div
                      key={row}
                      aria-hidden
                      className="skeleton w-full rounded-xl"
                      style={{
                        aspectRatio: `1 / ${RATIOS[(column * 3 + row) % RATIOS.length]}`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* Where this is used, and where it deliberately is not:
 *
 *   /studio/saved    yes — no child routes
 *   /studio/upload   yes — no child routes
 *   /studio/search   yes — no child routes
 *   /studio/spaces   NO  — `/studio/spaces/[id]` calls notFound(), and a
 *                          loading.tsx here would wrap it too. The list
 *                          page is a client component that renders its
 *                          own card skeletons while it fetches, so
 *                          nothing is lost.
 *   /studio          NO  — same reason, for `/studio/idea/[slug]`.
 */
