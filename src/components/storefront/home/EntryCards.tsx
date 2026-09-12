import Link from "next/link";
import { Box, Building, Chevron, Crown, Helmet } from "@/components/icons";

/**
 * The four doors into Quoin, at the very top of the home screen.
 *
 * Not the same row as `QuickActions`, and the difference is the point.
 * Quick actions are *verbs* — upload a parcha, start a project. These are
 * the four **places** the business is divided into, and someone arriving
 * for the first time picks one of them before they pick a task.
 *
 * Four across from `sm`, a rail below it.
 *
 * Four across is the reference, and it holds down to about 600px. Below
 * that a card is 78px wide, which after padding leaves 40px for the
 * description beside the chevron — "Professional" alone is wider than
 * that, so the row degrades into four columns of clipped words, and
 * shrinking the type until it fits means 7px labels nobody reads. The
 * rail keeps the card at a width its own words fit in and puts the fourth
 * door half a swipe away, which is the lesser loss.
 */
const ENTRIES = [
  {
    href: "/studio",
    title: "Quoin Studio",
    detail: "Your design platform",
    Icon: Building,
    tint: "var(--quoin-tile-1)",
  },
  {
    href: "/services",
    title: "Services",
    detail: "Professional services",
    Icon: Helmet,
    tint: "var(--quoin-tile-2)",
  },
  {
    href: "/products",
    title: "Products",
    detail: "Construction materials",
    Icon: Box,
    tint: "var(--quoin-tile-3)",
  },
  {
    /* The premium door is Quoin Pro. There is no separate bespoke-
       products storefront to point at, and inventing a link to one is
       worse than sending the same intent — trade pricing, a project
       manager, the crown — where it is actually served. */
    href: "/pro",
    title: "Architectural Premium Studio",
    detail: "Bespoke products",
    Icon: Crown,
    tint: "var(--quoin-tile-4)",
  },
];

export function EntryCards() {
  return (
    <div className="rail gap-2.5 px-5 pb-1 scroll-pl-5 sm:grid sm:grid-cols-4 sm:overflow-visible lg:gap-3 lg:px-0">
      {ENTRIES.map(({ href, title, detail, Icon, tint }) => (
        <Link
          key={href}
          href={href}
          style={{ background: tint }}
          className="group relative flex h-[8.75rem] w-[9.25rem] flex-col overflow-hidden rounded-card border border-line-hair p-3 transition-transform duration-200 ease-out-quart active:scale-[0.98] sm:w-auto lg:h-36 hover:lg:-translate-y-0.5"
        >
          {/* Three lines of headroom: "Architectural Premium Studio" takes
              all three, and clamping it instead would cut the word that
              distinguishes this door from the other three. */}
          <span className="line-clamp-3 font-display text-[10px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ink lg:text-[11px]">
            {title}
          </span>

          <Icon className="mx-auto my-auto size-7 text-ink lg:size-8" />

          <span className="flex items-end justify-between gap-1.5">
            <span className="min-w-0 text-[10px] leading-[1.25] text-muted lg:text-[11px]">
              {detail}
            </span>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-xs transition-colors group-hover:bg-accent-bright lg:size-7">
              <Chevron className="size-3.5" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
