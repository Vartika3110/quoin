import { PageLoading } from "@/components/storefront/PageLoading";

/**
 * Shown while this route's data is fetched.
 *
 * Every page here reads Postgres on every request, so this is not a rare
 * frame — on a cold connection from a site office it is the first second
 * of the page. A skeleton in the shape of what is coming is what keeps
 * that second from reading as a broken app.
 */
export default function Loading() {
  return <PageLoading variant="grid" />;
}
