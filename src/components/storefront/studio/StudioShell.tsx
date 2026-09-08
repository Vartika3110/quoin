import type { ReactNode } from "react";
import { AppShell } from "@/components/storefront/AppShell";
import { StudioNav } from "@/components/storefront/studio/StudioNav";
import { StudioProvider } from "@/lib/store/studio";
import { getSession } from "@/lib/auth/session";

/**
 * Studio's chrome, inside the site's chrome.
 *
 * `AppShell` still supplies the header, the footer and the phone's tab
 * bar — Studio is a room in this house, not a second house, and section
 * 33's rule that there is one authentication system has an equivalent
 * here: there is one navigation, and this adds a rail to it rather than
 * replacing it.
 *
 * `signedIn` is read from the session cookie here, on the server, and
 * handed to the provider. The cookie is `httpOnly`, so the browser cannot
 * see it; without this the store would have to ask the server on every
 * page just to be told nobody is signed in — the same reasoning, and the
 * same fix, as the root layout already applies to the projects store.
 */
export async function StudioShell({
  children,
  /** Rendered above the rail and the content, full width. */
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  const signedIn = Boolean(await getSession());

  return (
    <AppShell>
      <StudioProvider signedIn={signedIn}>
        <div className="pt-4 lg:pt-6">
          {header}

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
