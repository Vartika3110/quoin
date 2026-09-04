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
 * All of them are cheap — each holds an array or a counter in state and
 * reads `localStorage` once after mount — so mounting them for every route,
 * including ones that never open a cart, costs a few hundred bytes rather
 * than a request. The alternative, mounting per route, means the cart
 * badge resets on navigation, which is worse in every way.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>
        <WishlistProvider>
          <ProjectsProvider>
            <StickyBarProvider>{children}</StickyBarProvider>
          </ProjectsProvider>
        </WishlistProvider>
      </CartProvider>
    </ToastProvider>
  );
}
