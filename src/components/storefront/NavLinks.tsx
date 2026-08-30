"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Grid, Headset, Home, QMark } from "@/components/icons";

/**
 * The primary navigation, in both of its layouts.
 *
 * A client component only so it can read the current path. The alternative
 * — passing the path down from a server component — is not available here:
 * `AppShell` wraps every page, and a server component cannot see the URL
 * without turning every route into one that opts out of static rendering.
 *
 * Before this existed the first item was marked current unconditionally,
 * which was harmless while every destination but the home page 404'd and
 * is not any more.
 */

const NAV = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/categories", label: "Categories", Icon: Grid },
  { href: "/projects", label: "Project Hub", Icon: Box },
  { href: "/consult", label: "Consult", Icon: Headset },
  { href: "/studio", label: "Quoin Studio", Icon: QMark },
];

/**
 * `/` matches only itself; everything else matches its subtree, so a
 * product page under a section still lights that section up. Without the
 * special case for the root, every path in the app is "under" it and Home
 * would be permanently current.
 */
function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-bg/95 pt-2 backdrop-blur lg:hidden"
    >
      {NAV.map(({ href, label, Icon }) => {
        const on = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center gap-1 px-1 text-[10px] ${
              on ? "text-accent" : "text-muted"
            }`}
          >
            <Icon className="size-5" />
            <span className="text-center leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DesktopNavList() {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {NAV.map(({ href, label, Icon }) => {
        const on = isCurrent(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                on
                  ? "bg-accent-wash text-accent"
                  : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon className="size-5 shrink-0" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
