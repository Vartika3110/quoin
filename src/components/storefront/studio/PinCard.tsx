"use client";

import Link from "next/link";
import { useState } from "react";
import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { SaveSheet } from "@/components/storefront/studio/SaveSheet";
import { useToast } from "@/components/ui/Toast";
import { Cart, Heart, HeartFilled } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { isSaved, useStudio } from "@/lib/store/studio";
import type { IdeaView } from "@/lib/types/studio";

/**
 * One room in the wall.
 *
 * The photograph is the whole card. `IdeaCard` — the tile this replaces
 * on the discovery grid — put the title and the room under the picture,
 * on the argument that a scrim dark enough to guarantee contrast over an
 * unknown image is dark enough to spoil it. That argument is right and
 * the conclusion was still wrong for this surface: a caption under every
 * tile turns a wall of rooms into a list of things with pictures beside
 * them, and it costs about a fifth of the vertical space in a column
 * whose entire job is showing rooms. The title is not lost — it is the
 * first line of the detail view, one tap away.
 *
 * Two controls ride on the photograph, and both have to work without a
 * pointer:
 *
 *  - **Save**, top right. Always in the DOM and always focusable; it
 *    fades in on hover on a pointer device and stays put where there is
 *    no hover, because a phone has no other way to reach it.
 *  - **"Shop this look · N items"**, bottom. Permanently visible below
 *    `lg` for the same reason, and the count is real — it is the number
 *    of catalogue lines the room actually has, so a pin with none shows
 *    no pill rather than a promise the detail view cannot keep.
 *
 * The save button is a sibling of the link, not nested inside it: a
 * button inside an anchor is invalid HTML and every browser recovers
 * from it differently.
 */
export function PinCard({
  idea,
  sizes,
  preload = false,
}: {
  idea: IdeaView;
  sizes: string;
  preload?: boolean;
}) {
  const { savedOverride, unsave, signedIn } = useStudio();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

  const saved = isSaved(idea, savedOverride(idea.id));

  async function onSaveClick() {
    if (!signedIn) {
      /* An honest redirect rather than a heart that fills and empties
         again after a failed request. */
      window.location.href = `/signin?next=${encodeURIComponent(`/studio/pin/${idea.slug}`)}`;
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
    <div className="group/pin relative">
      <Link
        href={`/studio/pin/${idea.slug}`}
        aria-label={idea.title}
        className="block overflow-hidden rounded-card bg-sunk outline-none ring-accent/40 transition-shadow duration-200 ease-out-quart focus-visible:ring-2 hover:shadow-md"
      >
        <IdeaImage
          src={idea.imageUrl}
          alt={idea.title}
          width={idea.width}
          height={idea.height}
          blurDataUrl={idea.blurDataUrl}
          sizes={sizes}
          preload={preload}
        />

        {/* The hover darken. A scrim rather than a filter, so the
            photograph's own colour is unchanged underneath and the two
            white controls have something to sit against. Pointer devices
            only — on a phone it would simply be a permanently dimmer
            feed. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-deep/0 transition-colors duration-200 [@media(hover:hover)]:group-hover/pin:bg-deep/15"
        />
      </Link>

      <button
        type="button"
        onClick={onSaveClick}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${idea.title} from saves` : `Save ${idea.title}`}
        className={cn(
          "tap-target absolute right-2 top-2 grid size-10 place-items-center rounded-full bg-photo-cta/90 text-on-photo-cta shadow-md backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out-quart",
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          /* Visible wherever there is no hover to reveal it with, which
             is every touch screen and every keyboard. */
          "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/pin:opacity-100",
          saved && "[@media(hover:hover)]:opacity-100",
        )}
      >
        {saved ? <HeartFilled className="size-5" /> : <Heart className="size-5" />}
      </button>

      {idea.saveCount > 0 && (
        <span className="nums pointer-events-none absolute left-2 top-2 rounded-full bg-photo-cta/85 px-2 py-1 text-micro font-medium text-on-photo-cta backdrop-blur-sm">
          {idea.saveCount}
        </span>
      )}

      {idea.materialCount > 0 && (
        <Link
          href={`/studio/pin/${idea.slug}`}
          className={cn(
            "absolute inset-x-2 bottom-2 flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-plate-solid px-3 text-caption font-medium text-ink shadow-md transition-opacity duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/pin:opacity-100",
          )}
        >
          <Cart className="size-4 shrink-0" />
          <span className="truncate">
            {/* Two columns on a 390px phone leave the pill about 165px
                wide, and "Shop this look · 6 items" truncates to "6 i…"
                in it — which says less than the count alone. The words
                come back the moment there is room for them. */}
            <span className="hidden sm:inline">Shop this look · </span>
            {idea.materialCount} {idea.materialCount === 1 ? "item" : "items"}
          </span>
        </Link>
      )}

      {/* Mounted only while open — one portal per open sheet, not one per
          tile waiting in the DOM. */}
      {sheetOpen ? (
        <SaveSheet idea={idea} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      ) : null}
    </div>
  );
}
