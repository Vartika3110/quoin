import Link from "next/link";
import { Chevron, Upload } from "@/components/icons";

/**
 * Upload a parcha, as one line on the home page.
 *
 * Parcha is the thing on this site that nothing else does — a
 * handwritten materials list, read, matched against real SKUs and priced
 * line by line — and until now the home page said nothing about it. It
 * had a full-width promotional block once, which went with the other
 * four promos when the page was cut from eighteen blocks to three,
 * correctly: a half-screen pitch for a feature is a landing page's
 * device, not a home page's.
 *
 * A line is the other way to put a feature on a page. It takes one row,
 * it names the thing and what it does in six words, and a reader who
 * does not want it scrolls past it in one flick rather than one screen.
 *
 * **A tube rather than a card**, at the owner's instruction, and the
 * shape is doing work: everything else on this page that a reader
 * *enters* something into is a pill — the search field above it, the
 * Consult button beside that — while the cards below are things to look
 * at. A parcha is something you hand over, so it takes the shape of the
 * things you hand things to.
 *
 * Both widths. The phone has Parcha in the tab bar already, but a tab
 * bar names a destination and says nothing about what is behind it;
 * somebody who has never heard the word gets no help from a five-letter
 * label under an icon.
 */
export function ParchaLine() {
  return (
    <Link
      href="/upload"
      className="group mx-5 flex items-center gap-3 rounded-full border border-line-soft bg-surface py-2.5 pl-2.5 pr-4 transition-transform duration-200 ease-out-quart active:scale-[0.99] lg:mx-0 lg:gap-4 lg:py-3 lg:pl-3 lg:pr-5"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-wash text-accent lg:size-11">
        <Upload className="size-4.5 lg:size-5" />
      </span>

      {/* `min-w-0` so the second line truncates inside the pill instead of
          stretching it past the gutter — a tube that wraps to two rows
          stops reading as one. */}
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-semibold leading-snug text-ink">
          Upload your parcha
        </span>
        <span className="block truncate text-caption text-muted">
          A handwritten list, priced line by line
        </span>
      </span>

      <Chevron className="size-4 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}
