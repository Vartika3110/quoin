"use client";

import { Masonry } from "@/components/storefront/studio/Masonry";
import { IdeaCard } from "@/components/storefront/studio/IdeaCard";
import type { IdeaView } from "@/lib/types/studio";

/**
 * A masonry grid of ideas.
 *
 * `Masonry` is generic and takes `keyOf`, `ratioOf` and `render` as
 * functions, which is right for a layout primitive and impossible to use
 * from a server component — functions cannot cross that boundary. This is
 * the client wrapper that closes over them, so a page can render a grid
 * of ideas by passing data alone.
 *
 * The three callbacks are module-level constants rather than inline
 * arrows: `Masonry` memoises the column assignment on their identity, and
 * a fresh arrow per render would recompute the whole layout every time
 * anything above it changed.
 */
export function IdeaMasonry({
  ideas,
  sizes,
  label,
  preloadCount = 0,
}: {
  ideas: IdeaView[];
  /** Must describe the same column counts `useColumnCount` lays out, or
      the browser picks a source for the wrong box. */
  sizes: string;
  label: string;
  /** How many leading tiles are above the fold and worth preloading. */
  preloadCount?: number;
}) {
  return (
    <Masonry
      items={ideas}
      label={label}
      keyOf={keyOf}
      ratioOf={ratioOf}
      render={(idea, index) => (
        <IdeaCard idea={idea} sizes={sizes} preload={index < preloadCount} />
      )}
    />
  );
}

const keyOf = (idea: IdeaView) => idea.id;
const ratioOf = (idea: IdeaView) => idea.height / idea.width;
