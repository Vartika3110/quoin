"use client";

import { Stat } from "@/components/ui/Stat";
import { StatRowSkeleton } from "@/components/ui/Skeleton";
import { Briefcase, Heart, Layers, Pin } from "@/components/icons";
import { useProjects } from "@/lib/store/projects";
import { useWishlist } from "@/lib/store/wishlist";

/**
 * The four figures at the head of the account.
 *
 * A client component because two of the four — projects and saved
 * products — live in the browser until accounts own them, and rendering
 * them on the server would show zero to everyone and correct it after
 * hydration. The skeleton covers exactly that gap: one frame of "loading"
 * rather than one frame of a wrong number, which is the difference between
 * a dashboard that feels alive and one that flickers.
 */
export function AccountSummary({
  consultationCount,
  addressCount,
}: {
  consultationCount: number;
  addressCount: number;
}) {
  const { projects, ready: projectsReady } = useProjects();
  const { count: savedCount, ready: wishlistReady } = useWishlist();

  if (!projectsReady || !wishlistReady) return <StatRowSkeleton />;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Projects"
        value={projects.length}
        icon={<Layers className="size-4" />}
        href="/projects"
        hint={projects.length === 0 ? "None started yet" : undefined}
      />
      <Stat
        label="Saved"
        value={savedCount}
        icon={<Heart className="size-4" />}
        href="/account/wishlist"
        hint={savedCount === 0 ? "Nothing saved yet" : undefined}
      />
      <Stat
        label="Consultations"
        value={consultationCount}
        icon={<Briefcase className="size-4" />}
        href="/account/services"
      />
      <Stat
        label="Addresses"
        value={addressCount}
        icon={<Pin className="size-4" />}
        href="/account/addresses"
      />
    </div>
  );
}
