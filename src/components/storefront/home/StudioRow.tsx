import { ImageCard } from "@/components/ui/Card";
import type { IdeaView } from "@/lib/types/studio";
import { ROOM_LABEL } from "@/lib/types/studio";

/**
 * Five rooms from Studio, on the home page.
 *
 * Image cards, and the same ones the category row uses — a photograph
 * with a scrim and a serif title — because a room and a department are
 * the same kind of object to a reader scanning a page: a picture of
 * somewhere to go.
 *
 * The caption is the room's materials count rather than a price. A room
 * *has* a total and it is on the pin, but a "From ₹36,595" under a
 * photograph on the home page reads as a price for the room, which is
 * not a thing Quoin sells. The count is the honest version of the same
 * invitation: there is a priced list behind this.
 */
export function StudioRow({ rooms }: { rooms: IdeaView[] }) {
  return (
    /* A rail on a phone, five across from `lg`. `.rail` children refuse
       to shrink, so the card carries its own width there and the grid
       takes it back above. */
    <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:scroll-pl-0">
      {rooms.slice(0, 5).map((room) => (
        <ImageCard
          key={room.id}
          href={`/studio/pin/${room.slug}`}
          src={room.imageUrl}
          title={room.title}
          subtitle={room.location ?? (room.room ? ROOM_LABEL[room.room] : undefined)}
          caption={
            room.materialCount > 0
              ? `${room.materialCount} ${room.materialCount === 1 ? "material" : "materials"}`
              : undefined
          }
          label={room.title}
          blurDataURL={room.blurDataUrl}
          ratio="4 / 5"
          sizes="(min-width: 1024px) 18vw, 60vw"
          className="w-44 shrink-0 lg:w-auto"
        />
      ))}
    </div>
  );
}
