"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid, Home, Layers, Package, User } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * The phone's primary navigation.
 *
 * Five destinations, not six. The previous bar carried six on a 360px
 * screen, which left 60px a tab and forced 9px labels that wrapped — at
 * that size the label stops being read and the bar becomes six identical
 * glyphs. Five gives every tab a 72px target and a label that fits on one
 * line, and the two that came off (Deals, Upload Parcha) are one tap away
 * from the home page and from search.
 *
 * Deliberately not a mirror of the desktop nav: a phone's bar is for the
 * things you return to, and a desktop's is for the things you browse.
 *
 * No cart badge here, on purpose. There is no cart tab — the cart lives in
 * the header and in the floating bar — and hanging its count off "Orders"
 * says that an item in a basket is an order, which is the one thing a
 * commerce app must never blur.
 */
const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/categories", label: "Categories", Icon: Grid },
  { href: "/projects", label: "Projects", Icon: Layers },
  { href: "/account/orders", label: "Orders", Icon: Package },
  { href: "/account", label: "Account", Icon: User },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  /* `/account` must not light up on `/account/orders`, which has its own
     tab — an exact match for the parent, subtree matching for the rest. */
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line-soft bg-bg/95 pt-1.5 backdrop-blur-xl lg:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const on = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 flex-col items-center justify-center gap-1 px-1 text-micro transition-colors",
              on ? "text-accent" : "text-muted",
            )}
          >
            <Icon className="size-5.5" />
            <span className="leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
