"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headset } from "@/components/icons";
import { useStickyBarTaken } from "@/components/storefront/StickyBar";
import { useScrolled } from "@/components/storefront/nav/useScrolled";
import { cn } from "@/components/ui/cn";
import { useCart } from "@/lib/store/cart";

/**
 * Talk to an expert, from anywhere.
 *
 * The same destination and the same mark as the CONSULT card in the
 * header, on purpose: one glyph, one meaning. A different icon for the
 * same action would say they are two different things.
 *
 * Not a chat widget. There is nothing on the other end of a chat window
 * — no assistant, no staffed inbox — and a bubble that opens one and then
 * asks for a callback is worse than a bubble that says what it does. This
 * goes to `/consult`, which books a real slot with a real person.
 *
 * Three rules, the same three the cart bar lives by:
 *
 *  - **Phones only.** A ball pinned to the corner of a 1440px page reads
 *    as a phone app in a window, and the desktop header has room to say
 *    the word instead.
 *  - **Silent where it would be noise.** Not over the cart, checkout or
 *    sign-in, where the customer is committing rather than deciding, and
 *    not on the consultation page itself.
 *  - **It gets out of the way.** The bottom strip is shared with the cart
 *    bar and with whatever sticky bar a page mounts, so the bubble lifts
 *    above whichever of them is on screen rather than sitting on top of
 *    it.
 *  - **It is not on the first screen.** The header carries a CONSULT card
 *    until the reader scrolls, so a bubble there is the same offer twice —
 *    and, on a page whose first screen ends around 700px, it lands on top
 *    of whatever is at the fold. It fades in once the header's card has
 *    gone, which is exactly when the offer stops being reachable.
 */
const SILENT_PATHS = ["/cart", "/checkout", "/signin", "/consult"];

export function ConsultBubble() {
  const pathname = usePathname();
  const { count, ready } = useCart();
  const stickyTaken = useStickyBarTaken();
  /* The same threshold the header compacts at, so the card leaving and
     the bubble arriving are one movement rather than two. */
  const scrolled = useScrolled();

  if (SILENT_PATHS.some((p) => pathname.startsWith(p))) return null;

  /* Either the cart bar or a page's own action bar is occupying the strip
     the bubble would otherwise sit in. `ready` is false until the cart has
     been read out of storage, so the first paint puts the bubble low and
     the transition slides it up — which is a slide rather than the jump
     you get from swapping the class with no transition on it. */
  const stripTaken = stickyTaken || (ready && count > 0);

  return (
    <Link
      href="/consult"
      aria-label="Talk to an expert"
      aria-hidden={!scrolled}
      tabIndex={scrolled ? undefined : -1}
      className={cn(
        "fixed right-4 z-30 grid size-14 place-items-center rounded-full bg-deep text-on-deep shadow-lg",
        "transition-[bottom,background-color,transform,opacity] duration-200 ease-out-quart",
        "hover:bg-deep-soft active:scale-95 lg:hidden",
        /* Faded and untouchable rather than unmounted: a button that
           pops into the DOM mid-scroll cannot animate, and one that is
           only invisible would still swallow taps meant for the page. */
        scrolled
          ? "scale-100 opacity-100"
          : "pointer-events-none scale-90 opacity-0",
        stripTaken
          ? "bottom-[max(8.75rem,calc(8.25rem_+_env(safe-area-inset-bottom)))]"
          : "bottom-[max(4.75rem,calc(4.25rem_+_env(safe-area-inset-bottom)))]",
      )}
    >
      <Headset className="size-6" />
    </Link>
  );
}
