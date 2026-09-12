"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid, Home, Layers, Tag, Upload, User } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * The phone's primary navigation.
 *
 * Six destinations, matching the reference design. An earlier version cut
 * this to five on the argument that six tabs on a 360px screen leave 60px
 * each and force a label that wraps — which is true of a *centred* label
 * under a 22px glyph, and is why this bar is built differently: the glyph
 * drops to 20px, the label to 10px with its tracking tightened, and every
 * label is one word except the two that are allowed to wrap onto a second
 * line. The tab itself is still a 56px target, comfortably over the 44px
 * minimum, because the height is what a thumb actually hits.
 *
 * Deliberately not a mirror of the desktop nav: a phone's bar is for the
 * things you return to, and a desktop's is for the things you browse.
 * Upload Parcha earns a tab because it is the fastest path from "I have a
 * builder's list" to a priced basket, and it is unfindable anywhere else.
 *
 * No cart badge here, on purpose. There is no cart tab — the cart lives in
 * the header and in the floating bar — and hanging its count off another
 * tab says that an item in a basket is an order, which is the one thing a
 * commerce app must never blur.
 */
const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/categories", label: "Categories", Icon: Grid },
  { href: "/projects", label: "Project Hub", Icon: Layers },
  { href: "/upload", label: "Upload Parcha", Icon: Upload },
  { href: "/deals", label: "Deals", Icon: Tag },
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
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line-soft bg-bg/95 pt-1.5 backdrop-blur-xl lg:hidden"
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
            <Icon className="size-5" />
            {/* Not a scale token: 10px with negative tracking is below
                anything the type scale should offer for prose, and it
                exists here only because six labels have to fit across a
                360px screen without hyphenating. */}
            <span className="text-center text-[10px] leading-[1.15] tracking-[-0.01em]">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
