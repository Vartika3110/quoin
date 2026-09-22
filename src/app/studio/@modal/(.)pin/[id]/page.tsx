import { notFound } from "next/navigation";
import { PinModal } from "@/components/storefront/studio/PinModal";
import { getSession } from "@/lib/auth/session";
import { getSpacePin, listRelatedIdeas } from "@/lib/data/studio";

/**
 * A pin opened from inside Studio.
 *
 * Intercepts `/studio/pin/[id]` so that a click from the grid renders the
 * room over the grid rather than replacing it. Everything about the data
 * is identical to the full page beside it — deliberately, because two
 * queries for one screen is how the modal and the page start disagreeing
 * about what a room costs.
 *
 * No `StudioShell` here: the shell is already on the page underneath, and
 * a second `AppShell` inside the slot would render a second header, a
 * second footer and a second provider.
 */
export default async function PinModalRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const viewerId = session?.userId ?? null;

  const view = await getSpacePin(id, viewerId);
  if (!view) notFound();

  const related = await listRelatedIdeas(view.pin, viewerId, 5);

  return <PinModal view={view} related={related} />;
}
