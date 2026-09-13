import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Sparkle } from "@/components/icons";
import { IdeaCard } from "@/components/storefront/studio/IdeaCard";
import type { IdeaView } from "@/lib/types/studio";

/**
 * Saved Studio ideas, as this project's mood board.
 *
 * Reuses `IdeaCard` rather than a bespoke tile: it already carries the
 * save heart, the room/style caption and the link to the idea, and a
 * second, thinner card here would drift from it the first time either one
 * changes. The ideas themselves are fetched server-side by the project
 * page — the same `listFeed(..., { tab: "saved" })` `/studio/saved`
 * calls — because this component sits inside a client dashboard that
 * cannot reach Prisma itself.
 */
export function MoodBoard({ ideas }: { ideas: IdeaView[] }) {
  if (ideas.length === 0) {
    return (
      <EmptyState
        icon={<Sparkle className="size-6" />}
        title="No saved ideas yet"
        action={{ href: "/studio", label: "Browse Quoin Studio" }}
        compact
      >
        Save a room from Quoin Studio and it collects here as this
        project&apos;s mood board.
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {ideas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} sizes="(min-width: 1024px) 20vw, 45vw" />
        ))}
      </div>
      <Button href="/studio/saved" variant="ghost" size="sm" className="mt-3">
        View all saved ideas
      </Button>
    </div>
  );
}
