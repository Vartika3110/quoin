import type { ReactNode } from "react";
import { AppShell } from "@/components/storefront/AppShell";
import { StudioNav } from "@/components/storefront/studio/StudioNav";
import { StudioTopBar } from "@/components/storefront/studio/StudioTopBar";
import { StudioProvider } from "@/lib/store/studio";
import { getSession } from "@/lib/auth/session";

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
 * `StudioTopBar` replaces them with back, title, search and saved. From
 * `lg` nothing changes — the header costs nothing beside a 1440px page
 * and the rail is already the navigation.
 *
 * `signedIn` is read from the session cookie here, on the server, and
 * handed to the provider. The cookie is `httpOnly`, so the browser cannot
 * see it; without this the store would have to ask the server on every
 * page just to be told nobody is signed in — the same reasoning, and the
 * same fix, as the root layout already applies to the projects store.
 */
export async function StudioShell({
  children,
  /** Rendered above the rail and the content, full width. Desktop only —
      see the note above on what a masthead costs on a phone. */
  header,
  /** What the phone bar says. "Studio" unless a page is more specific. */
  barTitle,
}: {
  children: ReactNode;
  header?: ReactNode;
  barTitle?: string;
}) {
  const signedIn = Boolean(await getSession());

  return (
    <AppShell phoneChrome={false}>
      <StudioProvider signedIn={signedIn}>
        <StudioTopBar title={barTitle} />

        <div className="pt-4 lg:pt-6">
          {/* The masthead is a desktop luxury. On a phone the top bar
              already says where you are, and an eyebrow, a line of
              display type and a paragraph saying what Studio is for is
              the better part of a screen spent not showing a room. */}
          <div className="hidden lg:block">{header}</div>

          {/* Stacked below `lg`, side by side above it. `StudioNav` renders
              a chip row on a phone and a rail on a desktop, and without
              the column direction here the chip row becomes a *column* of
              the same flex line as the content — 300px of vertical pills
              beside a 40px-wide feed. */}
          <div className="flex flex-col gap-5 lg:flex-row lg:gap-10">
            <StudioNav />
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </StudioProvider>
    </AppShell>
  );
}
