"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building, Grid, Home, Layers, Upload } from "@/components/icons";
import { useStickyBarTaken } from "@/components/storefront/StickyBar";
import { cn } from "@/components/ui/cn";

/**
 * The phone's primary navigation.
 *
 * **Five destinations, not six.** The bar used to carry Deals and a
 * two-word "Upload Parcha" as well, and defended them on the grounds that
 * a 20px glyph over a 10px label with tightened tracking fits six across
 * a 360px screen. It does fit. What it costs is that every label is set
 * two steps below the type scale's smallest prose size, two of them wrap
 * onto a second line, and each tab is a 60px slice of the one row a thumb
 * uses without looking. Five tabs are 75px each, the labels are one word
 * at the size the scale actually offers, and nothing wraps.
 *
 * **The five are the five parts of the business, in the order somebody
 * moves through them**: the front door, the catalogue, the room you are
 * designing, the fastest way to price a written list, and the build it
 * all belongs to.
 *
 * Two changes from the version before this one, and both are about what a
 * phone's bar is *for* — the things you return to:
 *
 *  - **Studio replaced Account.** Studio is a place somebody comes back
 *    to across a whole renovation; an account page is somewhere you go
 *    once to check an address. Account did not lose its entry point, it
 *    moved to the header, which is where every other site on a phone puts
 *    it and where it sits beside the cart it belongs with.
 *  - **"Shop" replaced "Categories."** The tab went to a list of
 *    departments rather than to the catalogue, which made the one tab a
 *    materials buyer presses most an index page they then had to press
 *    again. `/products` is the shop; the department list is one tap
 *    inside it and still has its own rail on the home page.
 *
 * **Upload Parcha came back, and that is a correction.** It was cut on
 * the argument that the camera in the search field covers it — on every
 * page, at the point where someone is already describing what they want,
 * with a quick action and a promo on the home page besides. The argument
 * was sound and it was wrong: the first thing the owner said after the
 * cut was that they could not find Upload Parcha on screen. A feature
 * reachable through four indirect affordances and no direct one is a
 * feature people stop using, and a 20px camera glyph inside a search
 * field does not read as "turn a builder's list into a priced basket".
 * Five tabs at 75px still hold a one-word label; this one is "Parcha",
 * and it goes straight to the upload screen rather than to a page about
 * it.
 *
 * **Deals stayed cut.** It is "Under list price", a one-tap quick filter
 * on every browse page — the same set, scoped to whatever the customer is
 * actually looking at — and the standalone page keeps its home rail and
 * its footer link. Nobody has gone looking for it and failed.
 *
 * Deliberately not a mirror of the desktop nav: a phone's bar is for the
 * things you return to, and a desktop's is for the things you browse.
 *
 * No cart badge here, on purpose. There is no cart tab — the cart lives in
 * the header and in the floating bar — and hanging its count off another
 * tab says that an item in a basket is an order, which is the one thing a
 * commerce app must never blur.
 */
const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/products", label: "Shop", Icon: Grid },
  { href: "/studio", label: "Studio", Icon: Building },
  { href: "/upload", label: "Parcha", Icon: Upload },
  { href: "/projects", label: "Projects", Icon: Layers },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  /* Subtree matching. A tab that only lights on its own exact URL leaves
     every page beneath it telling the reader nothing about where they
     are, which is worst exactly where somebody is deepest in — a product
     inside the shop, a room inside Studio. */
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileTabBar() {
  const pathname = usePathname();
  const stickyTaken = useStickyBarTaken();

  /**
   * A page with its own bottom bar takes the strip outright.
   *
   * Sort and Filter on a listing, price and Add to cart on a product:
   * two fixed bars stacked is 112px of an 812px screen spent on chrome,
   * and the lower one is navigation the customer is not using while they
   * are deciding *this*. Every catalogue app on a phone resolves it the
   * same way, by standing the tab bar down.
   *
   * The signal is the one `CartBar` and `ConsultBubble` already use, so a
   * page claims the strip by mounting a `StickyBar` and nothing has to
   * know which page it is on. Reverting this is deleting the next line.
   */
  if (stickyTaken) return null;

  return (
    <nav
      aria-label="Primary"
      /* `app:select-none` for the tab bar only. Long-pressing a tab in
         the installed app otherwise raises the browser's own "Copy link /
         Open in new tab" sheet over what is meant to be a native-feeling
         strip — the one gesture that tells a customer the icon on their
         home screen is a web page. Left alone everywhere else: product
         names, SKUs and quantities are text people copy on purpose. */
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line-soft bg-bg/95 pt-1.5 backdrop-blur-xl app:select-none lg:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const on = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 flex-col items-center justify-center gap-1 px-0.5 transition-colors",
              on ? "text-accent" : "text-muted",
            )}
          >
            <Icon className="size-5.5" />
            {/* `text-micro`, off the scale, with its own tracking left
                alone. Five labels across 360px have 75px each and the
                longest is "Categories", which fits at 11px — the
                arbitrary 10px and the negative tracking were both there
                to fit six, and two of those six were two words. */}
            <span className="text-center text-micro leading-[1.15]">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
