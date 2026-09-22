import { Bricks, Helmet, Layers, Upload } from "@/components/icons";
import { ContentCard } from "@/components/ui/Card";

/**
 * The four things people arrive wanting to do.
 *
 * Verbs, not departments: the category menu already answers "what do you
 * sell". This row answers "what am I here for", and the two jobs read very
 * differently — "Shop materials" and "Cement & steel" are not the same
 * invitation.
 *
 * These used to be four pastel tiles, each a different tint, on the
 * argument that four white boxes distinguished only by a word and a line
 * drawing make the reader stop and read all four. The tint did do that —
 * and it also made this the only row on the site drawn that way, which is
 * the more expensive problem. Four tints is a fifth card type; the
 * accent-washed icon plate inside a content card does the same
 * separating work with the vocabulary every other card already uses.
 */
const ACTIONS = [
  {
    href: "/products",
    label: "Shop materials",
    shortLabel: "Materials",
    detail: "Cement to cabinet hinges",
    Icon: Bricks,
  },
  {
    href: "/services",
    label: "Find a service",
    shortLabel: "Services",
    detail: "Verified professionals",
    Icon: Helmet,
  },
  {
    href: "/upload",
    label: "Upload parcha",
    shortLabel: "Parcha",
    detail: "A list becomes an order",
    Icon: Upload,
  },
  {
    href: "/projects/new",
    label: "Start a project",
    shortLabel: "Project",
    detail: "Budget, tasks, deliveries",
    Icon: Layers,
  },
];

export function QuickActions() {
  return (
    /* Four across on a phone, four across on a desktop — but they are not
       the same card. On a phone this is a launcher row: a mark and a short
       label, all four on screen without scrolling. From `sm` the card
       grows a description line, which is worth having when there is room
       and is noise when there is not. */
    <div className="grid grid-cols-4 gap-2 px-5 sm:gap-3 lg:px-0">
      {ACTIONS.map(({ href, label, shortLabel, detail, Icon }) => (
        <ContentCard
          key={href}
          href={href}
          size="sm"
          align="center"
          icon={<Icon className="size-5" />}
          title={
            <>
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </>
          }
          padding="none"
          className="px-2 py-3 sm:px-4 sm:py-4"
        >
          {/* Not the card's `subtitle` slot: that slot always draws its
              own top margin, which on a phone would be 6px of empty space
              under every label for a line that is not there. */}
          <p className="mt-1.5 hidden text-micro leading-snug text-muted sm:block">
            {detail}
          </p>
        </ContentCard>
      ))}
    </div>
  );
}
