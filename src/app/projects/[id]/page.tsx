import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProjectDashboard } from "@/components/storefront/projects/ProjectDashboard";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getSession } from "@/lib/auth/session";
import { listFeed } from "@/lib/data/studio";
import type { IdeaView } from "@/lib/types/studio";

/** Tiles for a mood-board preview inside the dashboard, not a feed page —
    six is enough to fill the 2-column grid `MoodBoard` draws without
    fetching a page of forty a customer would have to scroll past. */
const MOODBOARD_PREVIEW_SIZE = 6;

export const metadata: Metadata = {
  title: "Project — Quoin",
  /* A signed-in customer's own data, scoped to their account — never
     something a crawler should index. */
  robots: { index: false, follow: false },
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  /* Not scoped to this project — there is no idea-to-project link, only
     "saved by this account" — so it is the same saved feed `/studio/saved`
     reads, capped to a preview. Fetched here, not in `ProjectDashboard`
     itself: that component is a client boundary and `listFeed` reaches
     into Prisma directly, the same reason the store only ever imports
     that module's *types*. */
  const moodboard: IdeaView[] = session
    ? (await listFeed(session.userId, { tab: "saved", limit: MOODBOARD_PREVIEW_SIZE })).ideas
    : [];

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-4 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Project Hub", href: "/projects" },
              { label: "Project" },
            ]}
          />
        </div>

        <div className="px-5 lg:px-0">
          {session ? (
            <ProjectDashboard id={id} moodboard={moodboard} />
          ) : (
            <SignInPrompt what="Sign in to see this project — it lives on your account now, not this browser." />
          )}
        </div>
      </div>
    </AppShell>
  );
}
