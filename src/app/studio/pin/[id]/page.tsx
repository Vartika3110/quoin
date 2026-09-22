import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { StudioChrome } from "@/components/storefront/studio/StudioChrome";
import { PinDetail } from "@/components/storefront/studio/PinDetail";
import { getSession } from "@/lib/auth/session";
import { getSpacePin, listRelatedIdeas } from "@/lib/data/studio";

type Params = { params: Promise<{ id: string }> };

/**
 * One room, as a page.
 *
 * This is what a shared link, a refresh and a crawler get. The modal at
 * `@modal/(.)pin/[id]` is the same data rendered over the grid — see
 * `src/app/studio/layout.tsx`.
 *
 * `[id]` takes a slug or an id, because `getSpacePin` accepts either: the
 * grid links by slug, which is the readable URL, and anything holding an
 * id — a save, a board item — does not have to look the slug up first.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const view = await getSpacePin(id, null);
  if (!view) return { title: "Room not found — Quoin Studio" };

  const { pin } = view;
  return {
    title: `${pin.title} — Quoin Studio`,
    description:
      pin.description ||
      `${pin.title}${pin.location ? ` · ${pin.location}` : ""} — and what it is made of.`,
    alternates: { canonical: `/studio/pin/${pin.slug}` },
    openGraph: {
      title: pin.title,
      description: pin.description,
      url: `/studio/pin/${pin.slug}`,
      type: "article",
    },
  };
}

export default async function PinPage({ params }: Params) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const viewerId = session?.userId ?? null;

  const view = await getSpacePin(id, viewerId);
  if (!view) notFound();

  const related = await listRelatedIdeas(view.pin, viewerId, 5);

  return (
    <StudioShell header={<StudioChrome />} barTitle={view.pin.title}>
      <PinDetail view={view} related={related} />
    </StudioShell>
  );
}
