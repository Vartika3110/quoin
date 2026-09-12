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
 * Four across at every width, never a rail. All four doors have to be on
 * screen at once or the row stops being a set of choices and becomes a
 * carousel whose fourth card — the premium one — nobody finds.
 *
 * That costs 78px a card on a 375px phone, and 64px on a 320px one, which
 * is what dictates everything else here: the type runs 8px and 7px, the
 * chevron drops to 16px, and the labels carry their own line breaks
 * rather than leaving the wrap to a measure this narrow. It is a tile
 * label, read in one glance, not prose — the same sizes the design
 * prototype uses for the same row.
 */
const ENTRIES = [
  {
    href: "/studio",
    /* `\n` plus `whitespace-pre-line`: at this measure the break decides
       whether "QUOIN STUDIO" reads as two words or as "QUOIN STU-/DIO". */
    title: "QUOIN\nSTUDIO",
    detail: "Your design\nplatform",
    Icon: Building,
    tint: "var(--quoin-tile-1)",
  },
  {
    href: "/services",
    title: "SERVICES",
    detail: "Professional\nservices",
    Icon: Helmet,
    tint: "var(--quoin-tile-2)",
  },
  {
    href: "/products",
    title: "PRODUCTS",
    detail: "Construction\nmaterials",
    Icon: Box,
    tint: "var(--quoin-tile-3)",
  },
  {
    /* The premium door is Quoin Pro. There is no separate bespoke-
       products storefront to point at, and inventing a link to one is
       worse than sending the same intent — trade pricing, a project
       manager, the crown — where it is actually served. */
    href: "/pro",
    /* A soft hyphen, not `hyphens: auto`. Automatic hyphenation is a
       dictionary lookup and browsers do not run it over all-caps text, so
       the one word on this row that cannot fit a 66px card at any legible
       size was simply being cut off. U+00AD is honoured by every engine,
       renders nothing until a break is actually needed, and puts the
       break where a typesetter would rather than wherever the character
       count lands. */
    title: "ARCHI\u00ADTECTURAL\nPREMIUM STUDIO",
    detail: "Bespoke\nproducts",
    Icon: Crown,
    tint: "var(--quoin-tile-4)",
  },
];

export function EntryCards() {
  return (
    <div className="grid grid-cols-4 gap-2 px-5 pb-1 lg:gap-3 lg:px-0">
      {ENTRIES.map(({ href, title, detail, Icon, tint }) => (
        <Link
          key={href}
          href={href}
          style={{ background: tint }}
          className="group relative flex h-[7.75rem] flex-col overflow-hidden rounded-card border border-line-hair p-1.5 transition-transform duration-200 ease-out-quart active:scale-[0.98] sm:h-[8.5rem] sm:p-2.5 lg:h-36 lg:p-4 hover:lg:-translate-y-0.5"
        >
          {/* `overflow-wrap` is the last-resort net under the soft hyphen:
              at 320px a card is 52px wide and even "TECTURAL" is close to
              the edge. A mid-word break with no hyphen is ugly; a word
              spilling out of its card is worse. */}
          <span
            lang="en"
            className="whitespace-pre-line font-display text-[8px] font-bold uppercase leading-[1.25] tracking-[0.02em] text-ink [overflow-wrap:anywhere] sm:text-[9.5px] sm:tracking-[0.05em] lg:text-[11px] lg:tracking-[0.07em]"
          >
            {title}
          </span>

          <Icon className="mx-auto my-auto size-5 text-ink sm:size-6 lg:size-8" />

          <span className="flex items-end justify-between gap-1">
            <span className="min-w-0 whitespace-pre-line text-[7px] leading-[1.3] text-muted sm:text-[8.5px] lg:text-[11px]">
              {detail}
            </span>
            {/* Gone below 375px. A card is 52px of usable width there, and
                the chevron plus its gap takes 20 of them — which leaves
                "Construction" clipped mid-word. The chevron is decoration;
                the whole card is the link, and a cut-off word is a worse
                signal than a missing arrow. */}
            <span className="hidden size-4 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-xs transition-colors group-hover:bg-accent-bright min-[375px]:grid sm:size-5 lg:size-7">
              <Chevron className="size-2.5 sm:size-3 lg:size-4" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
