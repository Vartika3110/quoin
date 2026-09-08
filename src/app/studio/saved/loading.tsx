import { StudioLoading } from "@/components/storefront/studio/StudioLoading";

/**
 * Shown while this route's data is fetched.
 *
 * Safe here because this route cannot 404 — see the note on
 * `StudioLoading` for why `/studio/idea/[slug]` and
 * `/studio/spaces/[id]` deliberately have none.
 */
export default function Loading() {
  return <StudioLoading />;
}
