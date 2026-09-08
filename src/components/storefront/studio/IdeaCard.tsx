"use client";

import Link from "next/link";
import { useState } from "react";
import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { SaveSheet } from "@/components/storefront/studio/SaveSheet";
import { useToast } from "@/components/ui/Toast";
import { Heart, HeartFilled } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { isSaved, useStudio } from "@/lib/store/studio";
import { ROOM_LABEL, type IdeaView } from "@/lib/types/studio";

/**
 * One tile in the feed.
 *
 * Section 4 asks for controls that appear on hover and stay clean when
 * they are not needed. What that must not mean is controls that exist
 * *only* on hover — a phone has no hover, and a keyboard has no pointer.
 * So:
 *
 *  - The save button is always in the DOM and always focusable. On a
 *    pointer device it fades in on hover or focus; on a touch device the
 *    `(hover: none)` query below keeps it visible, because there is no
 *    other way to reach it.
 *  - The whole tile is one link, and the save button is a sibling rather
 *    than a nested button — a button inside an anchor is invalid HTML and
 *    behaves differently in every browser.
 *  - The caption is not painted over the photograph. A scrim dark enough
 *    to guarantee contrast over an unknown image is dark enough to spoil
 *    it, so the title sits under the tile, where it is legible against a
 *    known ground.
 */
export function IdeaCard({
  idea,
  preload = false,
  sizes,
}: {
  idea: IdeaView;
  preload?: boolean;
  sizes: string;
}) {
  const { savedOverride, unsave, signedIn } = useStudio();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

  const saved = isSaved(idea, savedOverride(idea.id));

  async function onSaveClick() {
    if (!signedIn) {
      /* An honest redirect rather than a heart that fills and empties
         again after a failed request. `next` brings them back here. */
      window.location.href = `/signin?next=${encodeURIComponent(`/studio/idea/${idea.slug}`)}`;
      return;
    }

    if (saved) {
      try {
        await unsave(idea.id);
        toast.toast("Removed from your saves");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove");
      }
      return;
    }

    setSheetOpen(true);
  }

  return (
    <div className="group/tile relative">
      <Link
        href={`/studio/idea/${idea.slug}`}
        className="block overflow-hidden rounded-xl bg-sunk outline-none ring-accent/40 transition-[transform,box-shadow] duration-200 ease-out-quart focus-visible:ring-2 hover:-translate-y-0.5 hover:shadow-md"
      >
        <IdeaImage
          src={idea.imageUrl}
          alt={idea.title}
          width={idea.width}
          height={idea.height}
          blurDataUrl={idea.blurDataUrl}
          sizes={sizes}
          preload={preload}
          className="transition-transform duration-500 ease-out-quart group-hover/tile:scale-[1.03]"
        />
      </Link>

      <button
        type="button"
        onClick={onSaveClick}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${idea.title} from saves` : `Save ${idea.title}`}
        className={cn(
          "absolute right-2 top-2 flex size-9 items-center justify-center rounded-full",
          "border border-plate-edge bg-plate backdrop-blur-sm shadow-sm",
          "transition-[opacity,transform,background-color] duration-200 ease-out-quart",
          "hover:scale-105 active:scale-95",
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          /* Hidden until wanted on a pointer device; permanently visible
             where there is no pointer, and whenever it is already on. */
          saved
            ? "opacity-100"
            : "opacity-0 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        {saved ? (
          <HeartFilled className="size-4 text-accent anim-pop" />
        ) : (
          <Heart className="size-4 text-ink" />
        )}
      </button>

      <div className="px-0.5 pt-2">
        <Link
          href={`/studio/idea/${idea.slug}`}
          className="line-clamp-2 text-body-sm font-medium text-ink outline-none hover:text-accent focus-visible:underline"
        >
          {idea.title}
        </Link>

        {/* One line of metadata, not three. A tile is a photograph with a
            name; everything else is on the page it opens. */}
        <p className="mt-0.5 truncate text-caption text-faint">
          {[idea.room ? ROOM_LABEL[idea.room] : null, idea.styles[0], idea.creator?.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/* Mounted only once it has been opened, so a feed of forty tiles
          is not forty portals waiting in the DOM. */}
      {sheetOpen ? (
        <SaveSheet idea={idea} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      ) : null}
    </div>
  );
}
