import { ImageCard } from "@/components/ui/Card";
import type { IdeaView } from "@/lib/types/studio";
import { ROOM_LABEL } from "@/lib/types/studio";

/**
 * Four rooms from Studio, on the home page.
 *
 * Image cards, and the same ones the category row uses — a photograph
 * with a scrim and a serif title — because a room and a department are
 * the same kind of object to a reader scanning a page: a picture of
 * somewhere to go.
 *
 * **The card is labelled by room type, not by the room's own title.**
 * Those titles are written per pin — "Rose headboard, walnut and stone",
 * "Skyline bedroom at golden hour" — and five of them in a row is five
 * different sentences to read where the reader is doing one thing:
 * finding the kind of room they are working on. "Bedroom" is what they
 * are scanning for. The title is still on the pin itself, which is where
 * somebody who has chosen a room wants to read it.
 *
 * A pin with no `room` set falls back to its title rather than showing a
 * card with no label at all.
 *
 * The caption is the room's materials count rather than a price. A room
 * *has* a total and it is on the pin, but a "From ₹36,595" under a
 * photograph on the home page reads as a price for the room, which is
 * not a thing Quoin sells. The count is the honest version of the same
 * invitation: there is a priced list behind this.
 */
export function StudioRow({ rooms }: { rooms: IdeaView[] }) {
  return (
    /* **A two-by-two block, not a rail**, which is what the design
       reference draws here and the one place on this page where that is
       the right shape. Every other row is a shelf of things to compare
       — products, brands, people — and a shelf is swiped. Four rooms
       are not compared, they are chosen between, and a grid shows all
       four at once where a rail hides two of them off the edge.

       Four, because two-by-two is four. The fifth was only ever there
       to fill a rail. Four across from `lg`, where the width exists to
       put them on one line. */
    <div className="grid grid-cols-2 gap-3 px-5 lg:grid-cols-4 lg:px-0">
      {rooms.slice(0, 4).map((room) => (
        <ImageCard
          key={room.id}
          href={`/studio/pin/${room.slug}`}
          src={room.imageUrl}
          title={room.room ? ROOM_LABEL[room.room] : room.title}
          caption={
            room.materialCount > 0
              ? `${room.materialCount} ${room.materialCount === 1 ? "material" : "materials"}`
              : undefined
          }
          blurDataURL={room.blurDataUrl}
          /* 4:3 rather than 4:5. The reference's tiles are landscape,
             and a room photograph is a landscape subject — a portrait
             crop of a kitchen takes out the run of units that makes it
             read as a kitchen. */
          ratio="4 / 3"
          sizes="(min-width: 1024px) 23vw, 45vw"
        />
      ))}
    </div>
  );
}
