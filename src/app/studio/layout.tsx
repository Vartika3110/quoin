import type { ReactNode } from "react";
import { StudioProvider } from "@/lib/store/studio";
import { getSession } from "@/lib/auth/session";

/**
 * Studio's two slots.
 *
 * `modal` is a parallel route filled only by the intercepting route at
 * `@modal/(.)pin/[id]`. Opening a pin from the grid therefore changes the
 * URL to `/studio/pin/…` and renders that page *over* the grid, with the
 * grid still mounted underneath — so closing it is a back navigation, the
 * scroll position is where it was, and the forty images behind it are not
 * fetched again.
 *
 * The same URL typed, shared or refreshed misses the interception and
 * renders `pin/[id]/page.tsx` as an ordinary full page. One route, two
 * presentations, and the link works either way — which is the whole
 * reason a pin is a route at all rather than a state flag on the grid.
 *
 * `default.tsx` beside the slot is what renders when there is no pin
 * open. Without it, a hard navigation to any other Studio page would
 * fail to match the slot and 404 the whole layout.
 *
 * `StudioProvider` is here rather than in `StudioShell` for exactly one
 * reason: the modal slot is a *sibling* of `children`, so a provider
 * mounted inside the page would not contain it, and the save button in
 * an open pin would throw. Here it wraps both, and the save state the
 * grid is holding is the same state the pin over it reads — which is
 * what makes a heart filled in the modal already filled on the tile
 * behind it when the modal closes.
 *
 * `signedIn` is read from the session cookie on the server and handed
 * down. The cookie is `httpOnly`, so the browser cannot see it; without
 * this the store would have to ask the server on every page just to be
 * told nobody is signed in.
 */
export default async function StudioLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  const signedIn = Boolean(await getSession());

  return (
    <StudioProvider signedIn={signedIn}>
      {children}
      {modal}
    </StudioProvider>
  );
}
