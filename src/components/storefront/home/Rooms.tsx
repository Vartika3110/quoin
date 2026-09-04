import Image from "next/image";
import Link from "next/link";
import { Chevron } from "@/components/icons";
import { CATEGORY_PHOTOS } from "@/lib/category-photos";

/**
 * Discovery by room, not by department.
 *
 * The category grid answers "what do you sell"; this answers "I am doing
 * my bathroom". Those are different questions and the second one is how
 * most people actually arrive — nobody sets out to buy from Bathware &
 * plumbing, they set out to redo a bathroom.
 *
 * Every destination is a real filtered listing, and every photograph is
 * one Quoin already holds. Nothing here is a mood board of rooms that do
 * not exist: a page of inspiration photography we cannot source would be
 * the most obviously borrowed thing on the site.
 */
const ROOMS: {
  label: string;
  detail: string;
  href: string;
  /** Reuses the category photography, keyed by slug. */
  photoKey: string;
}[] = [
  {
    label: "Bathroom",
    detail: "Sanitaryware, mixers, showers",
    href: "/c/bathware-plumbing",
    photoKey: "bathware-plumbing",
  },
  {
    label: "Kitchen",
    detail: "Sinks, fittings, storage",
    href: "/c/kitchen-sinks-faucets",
    photoKey: "kitchen-sinks-faucets",
  },
  {
    label: "Floors & walls",
    detail: "Tile, stone, adhesives",
    href: "/c/tiling-adhesives",
    photoKey: "tiling-adhesives",
  },
  {
    label: "Lighting",
    detail: "Fittings, switchgear, fans",
    href: "/c/electricals-lighting",
    photoKey: "electricals-lighting",
  },
  {
    label: "Joinery",
    detail: "Ply, laminate, hardware",
    href: "/c/plywood-laminates",
    photoKey: "plywood-laminates",
  },
  {
    label: "Structure",
    detail: "Cement, steel, waterproofing",
    href: "/c/cement-steel",
    photoKey: "cement-steel",
  },
];

export function Rooms() {
  return (
    /* A rail on a phone and a six-across grid from `lg`. Six landscape
       tiles stacked on a phone is a screen and a half of scrolling before
       the next section, and this is a browse aid rather than the point of
       the page. */
    <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-6">
      {ROOMS.map((room) => (
        <Link
          key={room.href}
          href={room.href}
          className="group relative flex aspect-3/2 w-52 shrink-0 flex-col justify-end overflow-hidden rounded-card lg:aspect-4/5 lg:w-auto"
        >
          <Image
            src={CATEGORY_PHOTOS[room.photoKey]}
            alt=""
            fill
            loading="lazy"
            sizes="(min-width: 1280px) 220px, (min-width: 1024px) 300px, 208px"
            className="object-cover transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
          />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-deep via-deep/55 to-transparent" />
          <div className="relative p-3.5">
            <p className="text-body-sm font-semibold text-white">{room.label}</p>
            <p className="mt-0.5 flex items-center gap-1 text-micro text-white/75">
              {room.detail}
              <Chevron className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
