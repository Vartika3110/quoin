import { PageLoading } from "@/components/storefront/PageLoading";

/**
 * Shown while this route's data is fetched.
 *
 * Every page here reads Postgres on every request, so this is not a rare
 * frame — on a cold connection from a site office it is the first second
 * of the page. A skeleton in the shape of what is coming is what keeps
 * that second from reading as a broken app.
 *
 * **Only on routes that cannot 404.** A `loading.tsx` wraps its segment in
 * a Suspense boundary, and Next flushes that shell — committing HTTP 200 —
 * before the page body runs. A `notFound()` after that point can no longer
 * set the status, so the route answers 200 with 404 content: a soft 404,
 * which search engines index as a real page. `/p/[slug]`, `/c/[slug]`,
 * `/services/[slug]` and `/projects/[id]` all call `notFound()`, so none of
 * them has one of these. Verified: with the file, `/p/does-not-exist`
 * returned 200; without it, 404.
 */
export default function Loading() {
  return <PageLoading variant="dashboard" />;
}
