import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/storefront/studio/StudioShell";
import { SpaceWorkspace } from "@/components/storefront/studio/SpaceWorkspace";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getSession } from "@/lib/auth/session";
import { getOrCreateMoodboard, getSpace } from "@/lib/data/studio";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  const space = await getSpace(id, session?.userId ?? null);

  if (!space) return { title: "Not found — Quoin Studio" };

  const isPublic = space.visibility === "public";

  return {
    title: `${space.name} — Quoin Studio`,
    description: space.description || `A ${space.name} in progress on Quoin Studio.`,
    /* A private room holds someone's budget and their supplier notes.
       Section 43: private user material must never become indexable, and
       the 404 a stranger already gets is not the only thing that should
       be standing in the way. */
    robots: isPublic ? undefined : { index: false, follow: false },
    alternates: isPublic ? { canonical: `/studio/spaces/${space.slug}` } : undefined,
    openGraph: isPublic
      ? {
          title: space.name,
          description: space.description,
          url: `/studio/spaces/${space.slug}`,
          type: "article",
          ...(space.coverUrl ? { images: [{ url: space.coverUrl }] } : {}),
        }
      : undefined,
  };
}

/**
 * One room.
 *
 * Readable by its owner, and by anyone at all when it has been made
 * public — that is what makes a shared link work for someone who is not
 * signed in. Both the space and its moodboard resolve visibility inside
 * their own `where` clauses, so a private room 404s for a stranger rather
 * than 403ing and confirming it exists.
 */
export default async function SpacePage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  const viewer = session?.userId ?? null;

  const space = await getSpace(id, viewer);
  if (!space) notFound();

  /* Fetched here rather than lazily when the tab is opened: it is one
     query against a table keyed by `spaceId`, and fetching it on tab
     change would put a spinner in the middle of a canvas. */
  const moodboard = await getOrCreateMoodboard(space.id, viewer);

  return (
    <StudioShell>
      <div className="mb-4 px-5 lg:px-0">
        <Breadcrumb
          items={[
            { label: "Studio", href: "/studio" },
            { label: "Spaces", href: "/studio/spaces" },
            { label: space.name },
          ]}
        />
      </div>

      <SpaceWorkspace space={space} moodboard={moodboard} />
    </StudioShell>
  );
}
