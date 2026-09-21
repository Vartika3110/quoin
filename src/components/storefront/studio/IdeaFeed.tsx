"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { SaveSheet } from "@/components/storefront/studio/SaveSheet";
import { ProductImage } from "@/components/storefront/ProductImage";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Chevron, Heart, HeartFilled } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { isSaved, useStudio } from "@/lib/store/studio";
import { formatPrice } from "@/lib/types/catalog";
import { ROOM_LABEL, type IdeaView, type ShopTheLook } from "@/lib/types/studio";

/**
 * Discover, one room at a time.
 *
 * The masonry this replaced is the better tool for scanning forty rooms
 * fast, and it is still what Saved uses. This is the other half of the
 * job: a photograph big enough to actually read a finish off, with the
 * things it is made of priced underneath it.
 *
 * ## The image is not cropped
 *
 * Every post renders at its own aspect ratio, from the `width`/`height`
 * the uploader's bytes were measured at. A feed that forces 4:5 would
 * crop the top off a tall kitchen, and the one thing a room photograph
 * cannot survive is losing its ceiling.
 *
 * ## Two things the reference does that this does not
 *
 * **No creator identity.** The feed this is modelled on leads every post
 * with an avatar, a name and a Follow button. `StudioIdea.userId` is null
 * for everything Quoin ships, there is no follow graph, and `creator` on
 * the view is a name with no picture. So a post says who added it when a
 * person did, and says nothing when the answer is "this shipped with the
 * app" — rather than drawing a face and a Follow button for an author who
 * does not exist.
 *
 * **The caption is not painted over the photograph.** That is
 * `IdeaCard`'s argument and it holds here at a larger size, not less: a
 * scrim dark enough to guarantee contrast over an unknown image is dark
 * enough to spoil it, and these are photographs whose whole purpose is
 * being looked at. The title sits under the image, on a known ground.
 */

/** Full width on a phone, and the feed's own measure from `lg`. */
const SIZES = "(min-width: 1024px) 640px, 100vw";

export function IdeaFeed({
  ideas,
  preloadCount = 1,
}: {
  ideas: IdeaView[];
  /** How many posts are above the fold and worth preloading. One, in a
      single-column feed — the second is already a screen away. */
  preloadCount?: number;
}) {
  return (
    <ul className="mx-auto flex max-w-2xl flex-col gap-10">
      {ideas.map((idea, index) => (
        <li key={idea.id}>
          <IdeaPost idea={idea} preload={index < preloadCount} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The feed's own placeholder.
 *
 * `MasonrySkeleton` draws columns, which is the wrong promise here — a
 * filter change flashed a grid and then resolved into a single column,
 * which reads as the layout breaking rather than as content arriving.
 * Three posts at a plausible 4:5, which is roughly one screen.
 */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden className="mx-auto flex max-w-2xl flex-col gap-10">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-3 w-24 rounded bg-sunk" />
          <div className="aspect-[4/5] w-full rounded-xl bg-sunk" />
          <div className="h-4 w-2/3 rounded bg-sunk" />
        </div>
      ))}
    </div>
  );
}

function IdeaPost({ idea, preload }: { idea: IdeaView; preload: boolean }) {
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
    <article className="flex flex-col">
      {/* Who and what, above the photograph, and drawn with the weight
          the reference gives it — a feed's identity row is the thing that
          makes it read as a feed rather than as a page with pictures.
          What it cannot be is a *person*: `creator` is null for
          everything Quoin ships and there is no follow graph, so the
          circle holds the room's own first letter and the bold line is
          the room. An uploader's name goes in the second line, where it
          is true when it is there and absent when it is not. */}
      <div className="flex items-center gap-2.5 px-5 pb-2.5 lg:px-0">
        <span
          aria-hidden
          className="font-display grid size-9 shrink-0 place-items-center rounded-full bg-accent-wash text-body-sm font-semibold text-accent"
        >
          {(idea.room ? ROOM_LABEL[idea.room] : idea.title).charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-body-sm font-semibold leading-tight text-ink">
            {idea.room ? ROOM_LABEL[idea.room] : "Inspiration"}
          </p>
          <p className="truncate text-caption leading-tight text-faint">
            {[idea.styles[0], idea.creator ? `Added by ${idea.creator.name}` : null]
              .filter(Boolean)
              .join(" · ") || "From the Quoin collection"}
          </p>
        </div>
      </div>

      <div className="relative">
        <Link
          href={`/studio/idea/${idea.slug}`}
          className="block overflow-hidden bg-sunk outline-none ring-accent/40 focus-visible:ring-2 lg:rounded-xl"
        >
          <IdeaImage
            src={idea.imageUrl}
            alt={idea.title}
            width={idea.width}
            height={idea.height}
            blurDataUrl={idea.blurDataUrl}
            sizes={SIZES}
            preload={preload}
          />

          {/* The title, over the photograph.

              `IdeaCard` refuses to do this and is right to, at tile size:
              a flat scrim dark enough to guarantee contrast over an
              unknown image is dark enough to spoil it. What makes it
              survivable here is that this is not a flat scrim and not a
              tile — it is a gradient over the bottom quarter of a
              full-width photograph, transparent by the time it reaches
              the middle, so the part of the room anybody is looking at is
              untouched. `drop-shadow` does the rest of the work on a pale
              floor, where even this much gradient is not enough. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-5 pb-4 pt-16">
            <h2 className="font-display text-title font-semibold leading-tight text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">
              {idea.title}
            </h2>
          </div>
        </Link>

        <button
          type="button"
          onClick={onSaveClick}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${idea.title} from saves` : `Save ${idea.title}`}
          /* Always visible here, unlike the grid's hover-reveal: there is
             one post on screen and its save is the only control on it.
             See `IdeaCard` on why this is `surface/90` and not `plate`. */
          className={cn(
            "tap-target absolute right-3 top-3 flex size-10 items-center justify-center rounded-full",
            "border border-line-soft bg-surface/90 shadow-sm backdrop-blur-sm",
            "transition-transform duration-200 ease-out-quart hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          )}
        >
          {saved ? (
            <HeartFilled className="anim-pop size-4.5 text-accent" />
          ) : (
            <Heart className="size-4.5 text-ink" />
          )}
        </button>
      </div>

      {idea.description ? (
        <p className="line-clamp-2 px-5 pt-2.5 text-body-sm leading-snug text-muted lg:px-0">
          {idea.description}
        </p>
      ) : null}

      <ShopRail idea={idea} />

      {/* Mounted only once it has been opened, so a feed of forty posts
          is not forty portals waiting in the DOM. */}
      {sheetOpen ? (
        <SaveSheet idea={idea} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      ) : null}
    </article>
  );
}

/**
 * The materials, priced, under the photograph.
 *
 * Fetched when the post reaches the viewport rather than with the feed —
 * see the note on the route. A reader who scrolls past ten posts of forty
 * pays for ten.
 *
 * Renders nothing at all when the idea has no materials on it, which is
 * common: an empty "Shop this look" heading under a photograph is a
 * promise the data cannot keep. The wording and the per-card attribution
 * are `ShopThisLook`'s, for the reason given there — nothing here looked
 * at the photograph, these are the words somebody typed.
 */
function ShopRail({ idea }: { idea: IdeaView }) {
  const [look, setLook] = useState<ShopTheLook | null>(null);
  const [failed, setFailed] = useState(false);
  const anchor = useRef<HTMLDivElement | null>(null);

  /* Nothing to match against, so nothing to ask for. Saves a request per
     post on a feed of shipped imagery, which carries no materials. */
  const hasTerms = idea.materials.length > 0 || idea.styles.length > 0;

  useEffect(() => {
    const node = anchor.current;
    if (!node || !hasTerms || look || failed) return;

    let cancelled = false;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();

        try {
          const response = await fetch(
            `/api/v1/studio/ideas/${encodeURIComponent(idea.slug)}/look`,
          );
          if (!response.ok) throw new Error(String(response.status));
          const body = await response.json();
          if (!cancelled) setLook(body.data.look);
        } catch {
          /* Silent: the idea page carries the full, authoritative version
             of this section, and a red error under a photograph helps
             nobody decide whether they like the room. */
          if (!cancelled) setFailed(true);
        }
      },
      { rootMargin: "300px 0px" },
    );

    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [idea.slug, hasTerms, look, failed]);

  if (!hasTerms) return null;

  return (
    <div ref={anchor} className="mt-3">
      {look === null ? (
        /* Holds roughly the rail's height so the post below does not jump
           when the products land. */
        <div className="flex h-24 items-center px-5 lg:px-0">
          {!failed && <Spinner className="size-4 text-faint" />}
        </div>
      ) : look.matches.length === 0 ? null : (
        <>
          <div className="flex items-baseline justify-between gap-3 px-5 lg:px-0">
            <h3 className="text-caption font-semibold text-ink">Shop this look</h3>
            <Link
              href={`/studio/idea/${idea.slug}`}
              className="flex shrink-0 items-center gap-0.5 text-caption text-accent hover:underline"
            >
              All {look.matches.length}
              <Chevron className="size-3.5" />
            </Link>
          </div>

          <ul className="rail mt-2 gap-3 px-5 scroll-pl-5 lg:px-0 lg:scroll-pl-0">
            {/* Wide cards, photograph beside the words, not above them.
                A column of 128px tiles under a full-width photograph
                reads as an afterthought and gives the price two lines of
                its own; this is the shape the reference uses and it is
                also simply a bigger tap target for the thing the whole
                section exists to sell. */}
            {look.matches.slice(0, 8).map((match) => (
              <li key={match.slug} className="w-64 shrink-0">
                <Link
                  href={`/p/${match.slug}`}
                  className="group/p flex items-center gap-3 rounded-xl border border-line-soft bg-surface p-2 transition-colors hover:border-line"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-photo-edge bg-photo">
                    <ProductImage
                      photo={match.photo}
                      swatchKey={match.image}
                      label={match.title}
                      className="size-full transition-transform duration-500 ease-out-quart group-hover/p:scale-[1.06]"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-caption leading-snug text-ink">
                      {match.title}
                    </p>
                    <p className="nums mt-0.5 text-body-sm font-semibold text-ink">
                      {formatPrice(match.pricePaise)}
                    </p>
                    {/* Which word this came from. `ShopThisLook` says why
                        that attribution is not optional. */}
                    <p className="truncate text-micro text-faint">
                      from “{match.term}”
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
