"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ACCOUNT_SECTIONS } from "@/components/storefront/account/account-sections";
import { cn } from "@/components/ui/cn";

/**
 * The mobile chip row's active-into-view behaviour.
 *
 * A plain `<ul>` renders the same markup, but a rail with nine sections
 * scrolls: landing on one far enough along the row — Payments, Settings —
 * can open with the active chip sitting past the right edge, nothing on
 * screen saying which section is even selected. `scrollIntoView` on mount
 * fixes that without measuring anything by hand; the browser already knows
 * where the element sits inside its own scroll container. `.rail` itself
 * (`globals.css`) is what keeps the row from ever overflowing the
 * viewport — `overflow-x: auto` plus `scroll-snap-type`, unchanged here.
 */
export function AccountSectionChips({ current }: { current: string }) {
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  return (
    <ul className="rail mb-6 gap-2 px-5 scroll-pl-5 lg:hidden">
      {ACCOUNT_SECTIONS.map(({ href, label, Icon }) => {
        const on = href === current;
        return (
          <li key={href} ref={on ? activeRef : undefined}>
            <Link
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-caption transition-colors",
                on
                  ? "border-accent-edge bg-accent-wash font-medium text-accent"
                  : "border-line-soft bg-surface text-muted",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
