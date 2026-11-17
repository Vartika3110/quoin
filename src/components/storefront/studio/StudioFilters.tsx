import Link from "next/link";
import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { Close } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import type { RoomFacet } from "@/lib/data/studio";
import { ROOM_LABEL } from "@/lib/types/studio";
import {
  NO_FILTERS,
  countFilters,
  studioHref,
  toggle,
  type StudioFilters as Filters,
} from "@/lib/studio/query";

/**
 * Three dimensions, three rows, and every control a link.
 *
 * Links rather than buttons is the decision the rest of this follows
 * from. A filtered grid is then something a reader can middle-click into
 * a new tab, share, bookmark and reach with the back button, and a
 * crawler can see that `/studio?room=kitchen` exists at all. It also
 * means this whole component is a server component: no state, no effect,
 * no JavaScript shipped to draw a row of chips.
 *
 * **Rooms are bubbles because rooms are places.** "Kitchen" as a word in
 * a chip row reads as one more tag beside "warm" and "oak"; as a
 * photograph it reads as somewhere to go, which is what it is. Each
 * bubble shows a real room from behind that filter — the best-saved one —
 * rather than stock photography of a kitchen Quoin has never seen.
 *
 * **Style and material are no longer drawn**, at the owner's
 * instruction. They were two rows of compact chips above the wall — a
 * sticky "STYLE" rail and a foldaway "MATERIAL" one — and on the one
 * surface whose whole proposition is the photographs underneath them
 * that was the better part of a phone screen spent on controls. Rooms
 * stay, as bubbles: one dimension, chosen by looking at a picture.
 *
 * The filters themselves are untouched. `?style=` and `?material=`
 * still parse, still narrow the feed and still survive a share — see
 * `readFilters` — so a link somebody sent last week opens on the same
 * rooms, with "Clear filters" there to get back out. What went is the
 * way to *add* one by tapping, not the ability to hold one.
 *
 * A dimension with nothing in it renders nothing. An empty filter row is
 * a control that cannot do anything, taking up the space where the first
 * photograph should be.
 */
export function StudioFilters({
  facets,
  filters,
  resultCount,
}: {
  facets: { rooms: RoomFacet[]; styles: string[]; materials: string[] };
  filters: Filters;
  /** How many pins the current filters found, rendered as "N rooms".
      Null renders no line at all — which is what Discover passes, where
      a tally above the wall is a number nobody came for. Search passes
      one, because there "how many" is the question being answered. */
  resultCount: number | null;
}) {
  const active = countFilters(filters);

  /* A fragment, not a wrapper: the rows are siblings in the page's own
     column, which spans the whole wall, and the caller supplies the gap
     between them. */
  return (
    <>
      {facets.rooms.length > 0 && (
        <RoomBubbles rooms={facets.rooms} filters={filters} />
      )}

      {(resultCount !== null || active > 0) && (
        <div className="flex items-center gap-3 px-5 lg:px-0">
          {resultCount !== null && (
            <p className="nums text-caption text-muted">
              {resultCount} {resultCount === 1 ? "room" : "rooms"}
              {active > 0 ? " match" : ""}
            </p>
          )}
          {active > 0 && (
            <Link
              href={studioHref({ ...NO_FILTERS, q: filters.q })}
              className="tap-target flex items-center gap-1 text-caption font-medium text-accent hover:underline"
            >
              <Close className="size-3.5" />
              Clear filters
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The rooms, as photographs.
 *
 * A horizontal scroll at every width rather than a wrapping grid: eight
 * bubbles wrap to two rows on a phone and to one and a half on a tablet,
 * and a half-empty second row of circles is the least tidy thing a page
 * can open with. `scroll-pl-5` so a scrolled row still starts on the
 * gutter rather than flush against the screen edge.
 */
function RoomBubbles({ rooms, filters }: { rooms: RoomFacet[]; filters: Filters }) {
  return (
    <div className="no-scrollbar flex items-start gap-4 overflow-x-auto scroll-pl-5 px-5 lg:gap-5 lg:px-0 lg:scroll-pl-0">
      {rooms.map((facet) => {
        const on = filters.room === facet.room;
        return (
          <Link
            key={facet.room}
            href={studioHref(toggle(filters, "room", facet.room))}
            aria-current={on ? "true" : undefined}
            className="group flex w-20 shrink-0 flex-col items-center gap-2 outline-none lg:w-24"
          >
            <span
              className={cn(
                "grid size-20 place-items-center overflow-hidden rounded-full transition-[box-shadow,transform] duration-200 ease-out-quart lg:size-24",
                "group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-accent",
                on
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
                  : "ring-1 ring-line-soft",
              )}
            >
              {facet.imageUrl ? (
                <IdeaImage
                  src={facet.imageUrl}
                  alt=""
                  /* Cropped to a circle, so the intrinsic ratio does not
                     matter — only that `next/image` has a size to work
                     from. */
                  width={160}
                  height={160}
                  blurDataUrl={facet.blurDataUrl}
                  sizes="96px"
                  className="size-full object-cover"
                />
              ) : (
                <span className="size-full bg-sunk" />
              )}
            </span>
            <span
              className={cn(
                "line-clamp-2 text-center text-caption font-medium leading-tight",
                on ? "text-accent" : "text-muted group-hover:text-ink",
              )}
            >
              {ROOM_LABEL[facet.room]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
