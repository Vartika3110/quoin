"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Camera, Chevron, Heart, Search, Sofa } from "@/components/icons";

/**
 * Studio's own bar, on a phone.
 *
 * `StudioShell` used to argue that Studio is "a room in this house, not a
 * second house" and so should keep the site's header, tab bar and footer.
 * That was right about the architecture and wrong about the screen. The
 * cost was measurable: a reader reached the first photograph roughly
 * 370px down, past a location picker, a cart total, a search field, a
 * Consult card, a row of pills, two tabs and a chip row. Studio's whole
 * proposition is photographs of rooms, and it was the last thing on its
 * own page.
 *
 * So on a phone Studio now takes the screen: the site chrome stands down
 * (`AppShell`'s `phoneChrome`) and this replaces it — back, where you
 * are, and the two things you reach for from inside a feed.
 *
 * **Phone only.** At `lg` the site header costs nothing next to a 1440px
 * page, the desktop rail is already the navigation, and a page that
 * removed the header there would just strand the reader.
 *
 * Back is `router.back()` with a fallback, not a fixed link home: someone
 * arriving from the home page's Studio card wants that card back, and
 * someone deep-linked from a share has no history to return to.
 */
export function StudioTopBar({ title = "Studio" }: { title?: string }) {
  const router = useRouter();

  return (
    <div className="safe-top sticky top-0 z-40 flex items-center gap-1 border-b border-line-soft bg-bg/95 px-2 py-2 backdrop-blur-xl lg:hidden">
      <button
        type="button"
        onClick={() => {
          /* `history.length > 1` is the honest test for "is there
             anywhere to go back to". A tab opened straight onto a shared
             idea has none, and `back()` there does nothing at all — the
             one case where a back button has to mean something else. */
          if (window.history.length > 1) router.back();
          else router.push("/");
        }}
        aria-label="Back"
        className="tap-target relative grid size-10 shrink-0 place-items-center rounded-full text-ink transition-colors active:bg-hover"
      >
        <Chevron className="size-5 rotate-180" />
      </button>

      <p className="font-display min-w-0 flex-1 truncate text-title-sm font-semibold text-ink">
        {title}
      </p>

      {/* The chip row that used to sit under this bar, as icons. Four
          destinations and no room for words, so each carries its label
          for a screen reader and nothing for the eye. */}
      <BarLink href="/studio/search" label="Search Studio">
        <Search className="size-5" />
      </BarLink>
      <BarLink href="/studio/saved" label="Saved ideas">
        <Heart className="size-5" />
      </BarLink>
      <BarLink href="/studio/spaces" label="Your spaces">
        <Sofa className="size-5" />
      </BarLink>
      <BarLink href="/studio/upload" label="Add a photograph">
        <Camera className="size-5" />
      </BarLink>
    </div>
  );
}

function BarLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="tap-target relative grid size-10 shrink-0 place-items-center rounded-full text-ink transition-colors active:bg-hover"
    >
      {children}
    </Link>
  );
}
