import Link from "next/link";
import { Bricks, Chevron, Helmet, Layers, Upload } from "@/components/icons";

/**
 * The four things people arrive wanting to do.
 *
 * Verbs, not departments: the category menu already answers "what do you
 * sell". This row answers "what am I here for", and the two jobs read very
 * differently — "Shop materials" and "Cement & steel" are not the same
 * invitation.
 *
 * Each tile carries a restrained tint rather than a gradient. Four white
 * boxes distinguished only by a word and a line drawing make the reader
 * stop and read all four; the tint does that work before the type does.
 * Four *gradients*, on the other hand, are the first thing that makes a
 * page look generated.
 */
const ACTIONS = [
  {
    href: "/products",
    label: "Shop materials",
    shortLabel: "Materials",
    detail: "Cement to cabinet hinges",
    Icon: Bricks,
    tint: "var(--quoin-tile-3)",
  },
  {
    href: "/services",
    label: "Find a service",
    shortLabel: "Services",
    detail: "Verified professionals",
    Icon: Helmet,
    tint: "var(--quoin-tile-2)",
  },
  {
    href: "/upload",
    label: "Upload parcha",
    shortLabel: "Parcha",
    detail: "A list becomes an order",
    Icon: Upload,
    tint: "var(--quoin-tile-1)",
  },
  {
    href: "/projects/new",
    label: "Start a project",
    shortLabel: "Project",
    detail: "Budget, tasks, deliveries",
    Icon: Layers,
    tint: "var(--quoin-tile-4)",
  },
];

export function QuickActions() {
  return (
    /* Four across on a phone, four across on a desktop — but they are not
       the same tile. On a phone this is a launcher row: a mark and a short
       label, all four on screen without scrolling and about 100px tall in
       total. From `sm` the tile grows a second line of description, which
       is worth having when there is room and is noise when there is not. */
    <div className="grid grid-cols-4 gap-2 px-5 sm:gap-3 lg:px-0">
      {ACTIONS.map(({ href, label, shortLabel, detail, Icon, tint }) => (
        <Link
          key={href}
          href={href}
          style={{ background: tint }}
          className="group relative flex flex-col items-center gap-2 overflow-hidden rounded-card p-3 text-center transition-transform duration-200 ease-out-quart active:scale-[0.98] sm:items-start sm:gap-3 sm:p-4 sm:text-left hover:sm:-translate-y-0.5"
        >
          <span className="grid size-10 place-items-center rounded-lg bg-plate text-ink ring-1 ring-plate-edge transition-colors group-hover:bg-plate-solid sm:size-11">
            <Icon className="size-5 sm:size-5.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-micro font-semibold leading-tight text-ink sm:text-body">
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </span>
            <span className="mt-0.5 hidden text-micro leading-snug text-muted sm:block">
              {detail}
            </span>
          </span>
          <Chevron className="absolute right-3 top-4 hidden size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
        </Link>
      ))}
    </div>
  );
}
