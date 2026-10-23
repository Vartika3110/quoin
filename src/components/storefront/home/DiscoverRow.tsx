import Link from "next/link";
import { Lamp, People, Rooted, Trend } from "@/components/icons";

/**
 * The four curated sections, as a row of marks.
 *
 * These cut across the catalogue's own taxonomy rather than sitting
 * inside it, which is exactly why they need a row of their own: none of
 * them is a department, so none of them appears in the header's category
 * menu, and none would ever be found from `/categories`.
 *
 *  - **Trending** — what is actually moving, measured. See `getTrending`.
 *  - **Experts** — the specialist half of what Quoin can send you.
 *  - **Lighting** — decorative fittings, pulled out of electricals.
 *  - **Rooted** — Indian brands, and Quoin's own lines.
 *
 * Marks and labels rather than cards, matching `EntryCards` above it and
 * `ServiceIconRail` below: four bordered cards with a title and a
 * descriptor each is what that row looked like before it was cut down,
 * and at 320px it was four 52px boxes of 7px type. A mark with a word
 * under it is read at a glance, which is the only way a row like this is
 * read at all.
 *
 * Four across at every width — four short labels fit a 320px phone
 * without a rail, so there is nothing to swipe and nothing hidden.
 */
const SECTIONS = [
  { href: "/trending", label: "Trending", Icon: Trend },
  { href: "/experts", label: "Experts", Icon: People },
  { href: "/lighting", label: "Lighting", Icon: Lamp },
  { href: "/rooted", label: "Rooted", Icon: Rooted },
];

export function DiscoverRow() {
  return (
    <div className="grid grid-cols-4 gap-2 px-5 sm:gap-3 lg:px-0">
      {SECTIONS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex flex-col items-center gap-1.5 text-center"
        >
          <span className="grid size-14 place-items-center rounded-2xl border border-line-soft bg-accent-wash text-accent transition-transform duration-200 ease-out-quart group-active:scale-[0.96] lg:size-16">
            <Icon className="size-5.5 lg:size-6" />
          </span>
          <span className="text-micro font-medium leading-tight text-ink">{label}</span>
        </Link>
      ))}
    </div>
  );
}
