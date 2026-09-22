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
 * **Styles and materials stay compact chips**, because there are a dozen
 * of each and twelve photographs is a second grid above the grid.
 *
 * A dimension with nothing in it renders nothing. An empty filter row is
 * a control that cannot do anything, taking up the space where the first
 * photograph should be.
 *
 * On a phone the two chip rows stick under the top bar while the wall
 * scrolls past them — see the note at the point they are rendered.
 */
export function StudioFilters({
  facets,
  filters,
  resultCount,
}: {
  facets: { rooms: RoomFacet[]; styles: string[]; materials: string[] };
  filters: Filters;
  /** How many pins the current filters found. Null while it is not known
      — a search page that has not counted, say — which renders no line
      rather than "0 rooms". */
  resultCount: number | null;
}) {
  const active = countFilters(filters);

  /* A fragment, not a wrapper.
     
     `position: sticky` only sticks inside its own parent's box, and a
     wrapper around the three filter rows is about 220px tall — so the
     chip row below would travel 220px and then scroll away with it,
     which looks exactly like sticky not working at all. Returning the
     rows as siblings makes the page's own column their parent, and that
     column spans the whole wall. The caller supplies the gap. */
  return (
    <>
      {facets.rooms.length > 0 && (
        <RoomBubbles rooms={facets.rooms} filters={filters} />
      )}

      {/* The chips follow you down the wall on a phone; the room bubbles
          do not.

          A reader scrolling a wall of rooms is refining, and the two
          compact rows are what they refine with — reaching them again
          should not mean scrolling back past forty photographs. The
          bubbles are 80px of photography each and stay where they are:
          sticking those as well would spend a third of the screen on
          filters, on the one surface whose entire proposition is the
          pictures underneath them.

          `top` clears `StudioTopBar` — 56px of bar plus whatever the
          notch takes. Written with underscores because Tailwind forbids
          literal spaces inside `[...]` and `calc()` requires whitespace
          around `+`; without them the declaration is invalid, the
          browser drops it silently, and the row sticks to the very top
          *under* the bar. See the note in `docs/design-system.md`.

          Static from `lg`, where the whole filter block is above a grid
          that starts below the fold anyway. */}
      {(facets.styles.length > 0 || facets.materials.length > 0) && (
        <div className="sticky top-[calc(3.5rem_+_env(safe-area-inset-top))] z-30 flex flex-col gap-2 border-b border-line-hair bg-bg/95 py-2 backdrop-blur-xl lg:static lg:border-0 lg:bg-transparent lg:py-0 lg:backdrop-blur-none">
          {facets.styles.length > 0 && (
            <ChipRow
              label="Style"
              tags={facets.styles}
              chosen={filters.styles}
              dimension="style"
              filters={filters}
            />
          )}

          {facets.materials.length > 0 && (
            <ChipRow
              label="Material"
              tags={facets.materials}
              chosen={filters.materials}
              dimension="material"
              filters={filters}
            />
          )}
        </div>
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
            className="group flex w-16 shrink-0 flex-col items-center gap-1.5 outline-none lg:w-20"
          >
            <span
              className={cn(
                "grid size-16 place-items-center overflow-hidden rounded-full transition-[box-shadow,transform] duration-200 ease-out-quart lg:size-20",
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
                  sizes="80px"
                  className="size-full object-cover"
                />
              ) : (
                <span className="size-full bg-sunk" />
              )}
            </span>
            <span
              className={cn(
                "line-clamp-2 text-center text-micro font-medium leading-tight",
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

function ChipRow({
  label,
  tags,
  chosen,
  dimension,
  filters,
}: {
  label: string;
  tags: string[];
  chosen: string[];
  dimension: "style" | "material";
  filters: Filters;
}) {
  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto scroll-pl-5 px-5 lg:px-0 lg:scroll-pl-0">
      <span className="shrink-0 text-eyebrow uppercase text-faint">{label}</span>
      {tags.map((tag) => {
        const on = chosen.includes(tag);
        return (
          <Link
            key={tag}
            href={studioHref(toggle(filters, dimension, tag))}
            aria-pressed={on}
            className={cn(
              "flex min-h-8 shrink-0 items-center rounded-full border px-3 text-caption font-medium capitalize transition-colors",
              on
                ? "border-accent bg-accent text-on-accent"
                : "border-line-soft bg-surface text-muted hover:bg-hover hover:text-ink",
            )}
          >
            {tag}
          </Link>
        );
      })}
    </div>
  );
}
