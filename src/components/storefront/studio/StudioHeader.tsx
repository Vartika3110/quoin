import Link from "next/link";
import { Search } from "@/components/icons";

/**
 * Studio's front matter.
 *
 * A masthead and a search field, and nothing else. Section 2 asks for
 * inspiration to be the first thing on the page, which means everything
 * above the grid is a cost — so the eyebrow, the line of display type and
 * one input is the whole budget.
 *
 * The search field is a link, not an input. Typing into it opens
 * `/studio/search`, which is a real page with a URL that can be shared,
 * bookmarked and reached with the back button. An input that filters in
 * place looks the same and produces a result nobody can link to.
 */
export function StudioHeader({
  title = "Project Studio",
  subtitle,
  query,
}: {
  title?: string;
  subtitle?: string;
  query?: string;
}) {
  return (
    <header className="mb-6 px-5 lg:mb-8 lg:px-0">
      <p className="text-eyebrow uppercase text-accent">Quoin Studio</p>

      <h1 className="mt-1.5 font-display text-headline font-light tracking-tight text-ink lg:text-headline-lg">
        {title}
      </h1>

      <p className="mt-2 max-w-xl text-body text-muted">
        {subtitle ??
          "Collect rooms you like, work out what they are made of, and price the materials from the catalogue as you go."}
      </p>

      <Link
        href="/studio/search"
        className="mt-5 flex h-12 w-full max-w-xl items-center gap-3 rounded-full border border-line bg-surface px-5 text-body text-faint shadow-xs transition-[border-color,box-shadow] hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">
          {query ? query : "Search interiors, materials, styles…"}
        </span>
      </Link>
    </header>
  );
}
