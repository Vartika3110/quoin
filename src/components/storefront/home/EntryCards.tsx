import Link from "next/link";
import { Box, Building, Crown, Helmet } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * The four doors into Quoin, at the very top of the home screen.
 *
 * **Marks and labels, not cards.** They were four bordered content cards
 * carrying a title, a descriptor and a chevron each — at 320px that is
 * four 52px boxes holding three pieces of type apiece, set at 7px to fit,
 * with "ARCHITECTURAL" needing its own smaller size to survive. Type that
 * small is not read, it is squinted at, and the descriptors were saying
 * what the labels already said: "PRODUCTS / Construction materials".
 *
 * A mark with a word under it is what this row is for. It is the shape
 * the reference design uses, the shape `ServiceIconRail` already uses
 * further down the page, and it buys the label enough size to be read at
 * a glance — which is the only way a row above the fold is ever read.
 *
 * Handed to the header rather than rendered on the page: in the design
 * these sit under search, inside the bar that collapses on scroll.
 */
/**
 * `art` is an illustrated mark; `Icon` is the line fallback for a door
 * that has not been drawn yet. Both are kept so the row can be filled in
 * one door at a time rather than waiting for the set.
 *
 * The artwork has its own label baked into the bottom of the frame —
 * "Services" under the hard hat. That is cropped away by the aspect ratio
 * on the wrapper rather than by editing the file: the component sets its
 * own label underneath, in the page's type, at the page's size, in a
 * colour that follows the theme. A label flattened into a PNG does none
 * of those and would be the only text on the screen that cannot change
 * when the palette does.
 */
const ENTRIES: {
  href: string;
  label: string;
  Icon: typeof Box;
  art?: string;
}[] = [
  { href: "/studio", label: "Quoin Studio", Icon: Building },
  { href: "/services", label: "Services", Icon: Helmet, art: "/entry/services.webp" },
  { href: "/products", label: "Products", Icon: Box },
  /* `/premium`, not `/pro`. This door used to open Quoin Pro on the
     argument that there was no bespoke-products storefront to point at.
     A tile reading "Bespoke products" that opens a trade *membership*
     pitch answers a question the customer did not ask, and one they
     cannot act on either, since nobody has set a membership fee. The
     storefront exists now. */
  { href: "/premium", label: "Architectural Selects", Icon: Crown },
];

export function EntryCards() {
  return (
    <div className="grid grid-cols-4 gap-2 px-5 pb-1 lg:gap-3 lg:px-0">
      {ENTRIES.map(({ href, label, Icon, art }) => (
        <Link
          key={href}
          href={href}
          className="group flex flex-col items-center gap-1.5 text-center"
        >
          {/* **No tile behind the mark.** The reference sets its category
              icons bare on the page ground — no plate, no border, no tint
              — and that is what makes a row of them read as a set of
              things rather than a row of buttons. It also leaves the slot
              ready for the illustrated marks, which carry their own
              colour and would fight a tinted plate under them.

              The mark grows to fill the space the plate was taking, so
              the row keeps its weight. */}
          <span
            className={cn(
              "flex w-full justify-center overflow-hidden text-accent transition-transform duration-200 ease-out-quart group-active:scale-[0.94]",
              /* Top-aligned and clipped, so the taller artwork below has
                 its baked-in label cut off rather than scaled into
                 nothing. `object-contain` cannot do this: it fits the
                 whole frame, label and all, which left the hard hat a few
                 pixels tall. */
              art ? "h-12 items-start lg:h-14" : "h-12 items-center lg:h-14",
            )}
          >
            {art ? (
              /* Taller than its frame by exactly the share of the image
                 the label occupies — 1145px of artwork of which the last
                 ~195 is type — so the clip above removes the words and
                 nothing else. `max-w-none` because the frame is narrower
                 than this height implies and the mark must not be squeezed
                 to fit it.

                 Not `next/image`: four fixed marks a few dozen pixels
                 tall, where a per-mark `sizes` negotiation costs more than
                 it saves. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={art}
                alt=""
                loading="eager"
                decoding="async"
                className="h-[3.6rem] w-auto max-w-none lg:h-[4.2rem]"
              />
            ) : (
              <Icon className="size-8 lg:size-9" />
            )}
          </span>

          {/* `overflow-wrap:anywhere` is a net rather than a plan — every
              label here fits its own line down to 320px, and this only
              decides what happens if a future one does not. A word
              spilling out of the row is worse than one broken inside it. */}
          <span
            lang="en"
            className="text-micro font-medium leading-tight text-ink [overflow-wrap:anywhere]"
          >
            {label}
          </span>
        </Link>
      ))}
    </div>
  );
}
