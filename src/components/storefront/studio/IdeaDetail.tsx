"use client";

import { useState } from "react";
import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { SaveSheet } from "@/components/storefront/studio/SaveSheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { Heart, HeartFilled } from "@/components/icons";
import { isSaved, useStudio } from "@/lib/store/studio";
import { ROOM_LABEL, type IdeaView } from "@/lib/types/studio";

/**
 * One idea, large.
 *
 * The photograph is the page, so it gets the whole first column on a wide
 * screen and the whole width on a phone — `object-contain` inside a
 * height-capped box rather than a crop, because this is the one place
 * someone is looking at the image itself and cropping it here would hide
 * the part they came for.
 *
 * The palette is rendered from `idea.colors`, which is what the person
 * who uploaded it typed. The caption says that. Section 12 wants these
 * extracted from the photograph eventually and the column is shaped for
 * it; until something actually looks at an image, saying "extracted"
 * would be a lie about how the swatches got there.
 */
export function IdeaDetail({ idea }: { idea: IdeaView }) {
  const { savedOverride, unsave, signedIn } = useStudio();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

  const saved = isSaved(idea, savedOverride(idea.id));

  async function onSaveClick() {
    if (!signedIn) {
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
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      <div className="lg:min-w-0 lg:flex-[3]">
        <div className="overflow-hidden rounded-xl bg-sunk">
          <IdeaImage
            src={idea.imageUrl}
            alt={idea.title}
            width={idea.width}
            height={idea.height}
            blurDataUrl={idea.blurDataUrl}
            /* The one image on the page, and the reason someone opened
               it — so it loads eagerly rather than waiting for the
               viewport. */
            preload
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="max-h-[78vh] w-full object-contain"
          />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-[2]">
        <div>
          {/* The room, above the title and in the accent. It is the first
              thing a reader wants from a photograph of a room — "is this
              even my room?" — and it was previously only findable in the
              badge list three blocks down, below the buttons. */}
          {idea.room ? (
            <p className="text-eyebrow uppercase text-accent">
              {ROOM_LABEL[idea.room]}
            </p>
          ) : null}
          <h1 className="mt-1 font-display text-headline font-light tracking-tight text-ink">
            {idea.title}
          </h1>
          {idea.description ? (
            <p className="mt-2 text-body leading-relaxed text-muted">
              {idea.description}
            </p>
          ) : null}
          {idea.creator ? (
            <p className="mt-3 text-body-sm text-faint">
              Added by {idea.creator.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onSaveClick} variant={saved ? "outline" : "primary"}>
            {saved ? (
              <HeartFilled className="size-4 text-accent" />
            ) : (
              <Heart className="size-4" />
            )}
            {saved ? "Saved" : "Save"}
          </Button>
          <Button href="/studio/spaces" variant="secondary">
            Add to a space
          </Button>
        </div>

        {/* Styles only: the room moved up to the eyebrow, and repeating it
            here would be the same word twice on one screen. */}
        {idea.styles.length > 0 ? (
          <Meta label="Style">
            {idea.styles.map((tag) => (
              <Badge key={tag} tone="neutral" className="capitalize">
                {tag}
              </Badge>
            ))}
          </Meta>
        ) : null}

        {idea.materials.length > 0 ? (
          <Meta label="Materials">
            {idea.materials.map((material) => (
              <Badge key={material} tone="accent" className="capitalize">
                {material}
              </Badge>
            ))}
          </Meta>
        ) : null}

        {idea.colors.length > 0 ? (
          <div>
            <p className="text-eyebrow uppercase text-faint">Colours</p>
            <ul className="mt-2 flex flex-wrap gap-3">
              {idea.colors.map((colour) => (
                <li key={colour.hex} className="flex items-center gap-2">
                  <span
                    className="size-6 rounded-full border border-line-soft shadow-xs"
                    style={{ backgroundColor: colour.hex }}
                    /* The swatch is decoration; the name beside it is the
                       accessible text, so the square is hidden rather
                       than announced as an unlabelled image. */
                    aria-hidden
                  />
                  <span className="text-body-sm text-muted">{colour.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-caption text-faint">
              Chosen by whoever added this photograph.
            </p>
          </div>
        ) : null}
      </div>

      {sheetOpen ? (
        <SaveSheet idea={idea} open onClose={() => setSheetOpen(false)} />
      ) : null}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-eyebrow uppercase text-faint">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
