import Link from "next/link";
import { Photo } from "@/components/ui/Photo";
import { cn } from "@/components/ui/cn";
import type { Category } from "@/lib/types/catalog";

/**
 * A department, as the directory draws it.
 *
 * Deliberately not `CategoryTile`, which is the same subject in a
 * different shape: there the photograph *is* the card and the name sits
 * on it under a scrim, which is right for the home page's rails, where a
 * tile has to hold its own against the sections around it. Here there
 * are fourteen of them in a three-column grid and the reader is doing one
 * thing — scanning names — so the name comes off the picture and sits
 * under it in plain sans, black on the page ground, at a size that can be
 * read rather than squinted at. That is the design reference's own
 * arrangement, and it is also what three columns on a 375px screen can
 * actually carry: a scrim and a serif title inside a 105px square is two
 * words of unreadable type.
 *
 * **Coming soon is derived, not declared.** A department with nothing
 * sellable in it renders as a muted, unlinked tile with a badge, because
 * the one thing worse than a department that is not ready is a tile that
 * opens an empty grid. Nothing in the schema says "coming soon" and
 * nothing needs to: `productCount` already counts only what the
 * department page would actually list (see `getCategories`), so a
 * department lights up by itself the day merchandising prices its first
 * line, and goes back to COMING SOON if that line is withdrawn.
 */
export function CategoryGridTile({
  category,
  priority = false,
}: {
  category: Category;
  /** Set on the first row, which is above the fold. */
  priority?: boolean;
}) {
  const comingSoon = category.productCount === 0;

  const art = (
    <>
      <div className="relative overflow-hidden rounded-card bg-raised">
        <Photo
          src={category.photo}
          /* Empty: the name is right underneath in real text, and a
             screen reader reading "Cement photograph, Cement" is the
             picture being announced twice. */
          alt=""
          label={category.title}
          ratio="1 / 1"
          sizes="(min-width: 1024px) 220px, 31vw"
          priority={priority}
          /* Faded rather than greyscaled: a desaturated photograph on a
             cream ground reads as a loading failure, where a pale one
             reads as switched off — which is what it is. */
          imageClassName={cn(comingSoon && "opacity-45")}
        />

        {comingSoon && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-surface px-2.5 py-1 text-micro font-semibold uppercase tracking-wide text-ink shadow-sm">
            Coming soon
          </span>
        )}
      </div>

      <p
        className={cn(
          "mt-2 text-center text-caption font-semibold leading-snug",
          comingSoon ? "text-faint" : "text-ink",
        )}
      >
        {category.title}
      </p>
    </>
  );

  /* Not a link when there is nothing behind it. A disabled anchor is
     still an anchor to a keyboard and to a crawler; this is simply not
     one, and the badge is what says why. */
  if (comingSoon) {
    return <div className="min-w-0">{art}</div>;
  }

  return (
    <Link
      href={`/c/${category.slug}`}
      className="group min-w-0 transition-opacity active:opacity-70"
    >
      {art}
    </Link>
  );
}
