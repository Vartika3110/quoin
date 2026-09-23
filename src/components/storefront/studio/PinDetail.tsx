"use client";

import Link from "next/link";
import { useState } from "react";
import { HotspotPhoto } from "@/components/storefront/studio/HotspotPhoto";
import { MaterialsList } from "@/components/storefront/studio/MaterialsList";
import { AddAllToProject } from "@/components/storefront/studio/AddAllToProject";
import { SaveSheet } from "@/components/storefront/studio/SaveSheet";
import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Heart, HeartFilled, Pin } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { isSaved, useStudio } from "@/lib/store/studio";
import { formatPrice } from "@/lib/types/catalog";
import { ROOM_LABEL, type IdeaView, type SpacePinView } from "@/lib/types/studio";

/**
 * One room, everything about it.
 *
 * Two columns from `lg` and one below it, and the order is deliberate in
 * both: the photograph is first on a phone because it is what the reader
 * tapped, and the materials come under it because they are what the
 * photograph is *for*. Nothing here is a different component on a
 * different width — one tree, laid out twice, so there is no chance of
 * the phone and the desktop disagreeing about what a pin says.
 *
 * `selected` is the one piece of state the two halves share: the dot on
 * the photograph and the row in the list are the same number, and either
 * can set it.
 *
 * The footer is sticky on a phone and static under the list on a desktop.
 * It says "at today's list price" in words and it is not a quote: nothing
 * in this app has agreed a price for a whole room, and a serif total with
 * no qualifier beside it would read as one.
 */
export function PinDetail({
  view,
  related,
  /** Rendered in the modal, where a close control is the only way out
      that does not involve the browser's own back button. */
  onClose,
}: {
  view: SpacePinView;
  related: IdeaView[];
  onClose?: () => void;
}) {
  const { pin, materials, totalPaise } = view;
  const { savedOverride, unsave, signedIn } = useStudio();
  const toast = useToast();

  const [selected, setSelected] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);

  const saved = isSaved(pin, savedOverride(pin.id));

  async function onSaveClick() {
    if (!signedIn) {
      window.location.href = `/signin?next=${encodeURIComponent(`/studio/pin/${pin.slug}`)}`;
      return;
    }
    if (saved) {
      try {
        await unsave(pin.id);
        toast.toast("Removed from your saves");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove");
      }
      return;
    }
    setSheetOpen(true);
  }

  const tags = [...pin.styles, ...pin.materials];

  return (
    <article className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <HotspotPhoto
          pin={pin}
          materials={materials}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <header className="px-5 lg:px-0">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display min-w-0 text-headline font-light tracking-tight text-ink">
              {pin.title}
            </h1>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="shrink-0 lg:hidden"
              >
                Close
              </Button>
            )}
          </div>

          {(pin.location || pin.room) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-body-sm text-muted">
              <Pin className="size-3.5 shrink-0" />
              {pin.location ?? (pin.room ? ROOM_LABEL[pin.room] : null)}
              {pin.designer && (
                <>
                  <span aria-hidden>·</span>
                  <Link
                    href={`/studio/designers/${pin.designer.slug}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {pin.designer.name}
                  </Link>
                </>
              )}
            </p>
          )}

          {pin.description && (
            <p className="mt-3 text-body text-muted">{pin.description}</p>
          )}

          {tags.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={`/studio?${pin.styles.includes(tag) ? "style" : "material"}=${encodeURIComponent(tag)}`}
                    className="flex min-h-8 items-center rounded-full border border-line-soft bg-surface px-3 text-caption capitalize text-muted transition-colors hover:bg-hover hover:text-ink"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onSaveClick}>
              {saved ? (
                <HeartFilled className="size-4 text-accent" />
              ) : (
                <Heart className="size-4" />
              )}
              {saved ? "Saved" : "Save"}
              {pin.saveCount > 0 && (
                <span className="nums text-faint">{pin.saveCount}</span>
              )}
            </Button>
          </div>
        </header>

        {materials.length > 0 ? (
          <>
            <MaterialsList
              materials={materials}
              selected={selected}
              onSelect={setSelected}
            />

            {/* Pinned to the viewport on a phone, static under the list on
                a desktop, and the same markup either way. `safe-bottom`
                keeps it clear of the home indicator — and Studio stands
                the app's own tab bar down, so there is nothing else down
                there to stack against. */}
            <footer className="safe-bottom sticky bottom-0 z-20 -mx-0 border-t border-line-soft bg-bg/95 px-5 py-3 backdrop-blur-xl lg:static lg:rounded-card lg:border lg:bg-surface lg:px-5 lg:backdrop-blur-none">
              <p className="text-caption text-muted">
                This room&rsquo;s materials, at today&rsquo;s list price
              </p>
              <p className="nums font-display mt-0.5 text-title-lg font-semibold text-ink">
                {formatPrice(totalPaise)}
              </p>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 lg:flex-none"
                  onClick={onSaveClick}
                >
                  Save to board
                </Button>
                <Button className="flex-1 lg:flex-none" onClick={() => setProjectOpen(true)}>
                  Add all to project
                </Button>
              </div>
            </footer>
          </>
        ) : (
          /* No invented list. A room nobody has itemised says so, rather
             than showing an empty "Materials in this room" heading with a
             ₹0 total under it. */
          <p className="px-5 text-body-sm text-faint lg:px-0">
            Nobody has itemised this room yet. The tags above are what it is
            made of — each one searches the catalogue.
          </p>
        )}

        {related.length > 0 && <MoreLikeThis related={related} />}
      </div>

      {sheetOpen ? (
        <SaveSheet idea={pin} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      ) : null}

      {projectOpen ? (
        <AddAllToProject
          open={projectOpen}
          onClose={() => setProjectOpen(false)}
          materials={materials}
          roomName={pin.title}
          totalPaise={totalPaise}
        />
      ) : null}
    </article>
  );
}

/**
 * Five rooms that share this one's tags.
 *
 * Plain links to `/studio/pin/[slug]`, which is the same shallow route
 * the grid uses — so clicking one inside the modal replaces the modal's
 * content and leaves a history entry, and the back button walks back
 * through the rooms somebody looked at. Swapping the content with local
 * state instead would look identical and make back close the whole thing.
 */
function MoreLikeThis({ related }: { related: IdeaView[] }) {
  return (
    <section className="px-5 lg:px-0">
      <h2 className="font-display text-title-sm font-semibold text-ink">
        More like this
      </h2>
      <ul className="mt-3 grid grid-cols-5 gap-2">
        {related.slice(0, 5).map((pin) => (
          <li key={pin.id}>
            <Link
              href={`/studio/pin/${pin.slug}`}
              aria-label={pin.title}
              className={cn(
                "block overflow-hidden rounded-lg bg-sunk outline-none transition-transform duration-200 ease-out-quart",
                "hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent",
              )}
            >
              <IdeaImage
                src={pin.imageUrl}
                alt=""
                /* `alt` is empty — the link around it carries the name —
                   but the stand-in tile is a visible thing and a blank
                   one in a row of five is indistinguishable from a
                   rendering fault. */
                label={pin.title}
                width={pin.width}
                height={pin.height}
                blurDataUrl={pin.blurDataUrl}
                sizes="(min-width: 1024px) 110px, 20vw"
                className="aspect-square object-cover"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
