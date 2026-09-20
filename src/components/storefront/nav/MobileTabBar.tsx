"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid, Home, Layers, User } from "@/components/icons";
import { useStickyBarTaken } from "@/components/storefront/StickyBar";
import { cn } from "@/components/ui/cn";

/**
 * The phone's primary navigation.
 *
 * **Four destinations, not six.** The bar used to carry Upload Parcha and
 * Deals as well, and defended them on the grounds that a 20px glyph over
 * a 10px label with tightened tracking fits six across a 360px screen. It
 * does fit. What it costs is that every label is set two steps below the
 * type scale's smallest prose size, two of them wrap onto a second line,
 * and each tab is a 60px slice of the one row a thumb uses without
 * looking. Four tabs are 94px each, the labels are one word at the size
 * the scale actually offers, and nothing wraps.
 *
 * The two that went are *actions*, not destinations, and both had a home
 * already:
 *
 *  - **Upload Parcha** is the camera in the search field — on every page,
 *    at the point where someone is already trying to describe what they
 *    want. It is also a quick action and a promo on the home page, and it
 *    is in the footer. The old claim here that it was "unfindable
 *    anywhere else" stopped being true once the header grew that icon.
 *  - **Deals** is "Under list price", a one-tap quick filter on every
 *    browse page, which is the same set scoped to whatever the customer
 *    is actually looking at. The standalone page keeps its home rail and
 *    its footer link.
 *
 * What is left is what a materials buyer returns to: the front door, the
 * catalogue, their projects, and their orders.
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
  { href: "/categories", label: "Categories", Icon: Grid },
  { href: "/projects", label: "Projects", Icon: Layers },
  { href: "/account", label: "Account", Icon: User },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  /* Subtree matching, `/account` included: it used to be an exact match
     on the grounds that `/account/orders` "has its own tab", which no
     version of this bar has ever been true of. The effect was that every
     page inside Account lit up no tab at all, so the one screen where a
     customer is deepest in their own records was the one that stopped
     telling them where they were. */
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
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line-soft bg-bg/95 pt-1.5 backdrop-blur-xl lg:hidden"
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
                alone. Four labels across 360px have 94px each and the
                longest is "Categories" — the arbitrary 10px and the
                negative tracking were both there to fit six. */}
            <span className="text-center text-micro leading-[1.15]">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
