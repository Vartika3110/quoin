"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { CartProvider } from "@/lib/store/cart";
import { WishlistProvider } from "@/lib/store/wishlist";
import { ProjectsProvider } from "@/lib/store/projects";
import { StickyBarProvider } from "@/components/storefront/StickyBar";

/**
 * Client state, mounted once at the root.
 *
 * Nesting order is deliberate: `ToastProvider` is outermost because the
 * others raise confirmations through it, and a provider cannot use a hook
 * from a context mounted inside itself.
 *
 * `StickyBarProvider` is innermost and is not a store at all: it is how a
 * page's own action bar tells the floating cart bar to stand down, so that
 * two fixed bars never stack on the same strip of a phone screen.
 *
 * Cart, wishlist and the sticky bar are cheap — each holds an array or a
 * counter in state and reads `localStorage` once after mount — so mounting
 * them for every route, including ones that never open a cart, costs a few
 * hundred bytes rather than a request. The alternative, mounting per route,
 * means the cart badge resets on navigation, which is worse in every way.
 *
 * `ProjectsProvider` is the exception and needs `isSignedIn` because of it.
 * Projects moved onto the account, so it is the one store here that talks
 * to the server, and for a while it did so on every route for every
 * visitor — including the signed-out majority, whose request could only
 * ever come back 401. The session cookie is httpOnly and invisible to the
 * browser, so the answer has to be handed down from the layout that
 * rendered the page.
 */
export function AppProviders({
  children,
  isSignedIn,
}: {
  children: ReactNode;
  isSignedIn: boolean;
}) {
  return (
    <ToastProvider>
      <CartProvider>
        <WishlistProvider>
          {/* Keyed on the session so signing in or out remounts the store.
              Without it, a logged-out tab keeps the previous account's
              projects in memory until a full reload. */}
          <ProjectsProvider key={String(isSignedIn)} isSignedIn={isSignedIn}>
            <StickyBarProvider>{children}</StickyBarProvider>
          </ProjectsProvider>
        </WishlistProvider>
      </CartProvider>
    </ToastProvider>
  );
}
