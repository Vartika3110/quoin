import type { ReactNode } from "react";
import { AppShell } from "@/components/storefront/AppShell";
import { StudioTopBar } from "@/components/storefront/studio/StudioTopBar";

/**
 * Studio's chrome — the site's on a desktop, its own on a phone.
 *
 * This used to keep the site header, footer and tab bar at every width,
 * on the argument that Studio is a room in this house rather than a
 * second house. That is still true of the architecture — one session, one
 * catalogue, one cart — and it turned out to be the wrong conclusion
 * about a 375px screen. Stacked up, the site header, Studio's masthead,
 * its search field, its pills, its tabs and its filter chips put the
 * first photograph about 370px down. A surface whose entire proposition
 * is photographs of rooms was showing everything except one.
 *
 * So on a phone Studio takes the screen: `phoneChrome={false}` stands the
 * site's phone bar, tab bar, cart bar, bubble and footer down, and
 * `StudioTopBar` replaces them with back, title, search and saved.
 *
 * **The desktop rail is gone too.** It was 208px of every page spent on
 * four links, permanently, beside a grid whose whole job is to be as wide
 * as the container allows — and at 1440px it was the difference between
 * four columns of rooms and five. The same four destinations are pills on
 * the masthead line now, where they cost nothing, and `StudioChrome`
 * draws them.
 *
 * `StudioProvider` is *not* here. It sits in `src/app/studio/layout.tsx`,
 * above both this and the intercepted pin route — a provider mounted
 * inside the page would not contain the modal slot beside it, and the
 * save button in an open pin would throw for want of a context.
 */
export function StudioShell({
  children,
  /** The masthead, full width above the content. Desktop only — see the
      note above on what a masthead costs on a phone. */
  header,
  /** What the phone bar says. "Studio" unless a page is more specific. */
  barTitle,
}: {
  children: ReactNode;
  header?: ReactNode;
  barTitle?: string;
}) {
  return (
    <AppShell phoneChrome={false}>
      <StudioTopBar title={barTitle} />

      <div className="pt-4 lg:pt-6">
        {/* The masthead is a desktop luxury. On a phone the top bar
            already says where you are, and a line of display type plus a
            paragraph saying what Studio is for is the better part of a
            screen spent not showing a room. */}
        <div className="hidden lg:block">{header}</div>

        <div className="min-w-0">{children}</div>
      </div>
    </AppShell>
  );
}
