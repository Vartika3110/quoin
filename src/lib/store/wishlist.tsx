"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  createPersistentStore,
  usePersistentStore,
} from "@/lib/store/persistent";
import { useHydrated } from "@/lib/store/hydrated";
import { resolvePrice, type Paise, type Product } from "@/lib/types/catalog";

/**
 * Saved products.
 *
 * Kept as a small snapshot rather than a list of slugs so the wishlist
 * page renders without a request per item, and so a product that is later
 * retired still shows what was saved instead of vanishing silently.
 *
 * Like the cart, this is browser-local until accounts own it. The API is
 * already the one a server-backed version would have — `toggle` returns
 * the new state so the caller can animate without re-reading the store.
 */

const EMPTY: WishlistItem[] = [];
const store = createPersistentStore<WishlistItem[]>("wishlist", 1, EMPTY);

export interface WishlistItem {
  slug: string;
  title: string;
  brand: string | null;
  photo?: string;
  image: string;
  pricePaise: Paise;
  savedAt: number;
}

interface WishlistApi {
  items: WishlistItem[];
  count: number;
  ready: boolean;
  has: (slug: string) => boolean;
  /** Returns `true` if the product is saved after the call. */
  toggle: (product: Product) => boolean;
  remove: (slug: string) => void;
  clear: () => void;
}

const WishlistContext = createContext<WishlistApi | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = usePersistentStore(store);
  const ready = useHydrated();

  const remove = useCallback((slug: string) => {
    setItems((current) => current.filter((i) => i.slug !== slug));
  }, [setItems]);

  const toggle = useCallback((product: Product) => {
    /* The return value is computed from the state we are about to set,
       not read back afterwards — `setItems` is async and reading `items`
       here would report the value from before the click. */
    let saved = false;
    setItems((current) => {
      const exists = current.some((i) => i.slug === product.slug);
      saved = !exists;
      if (exists) return current.filter((i) => i.slug !== product.slug);
      const price = resolvePrice(product, false);
      return [
        {
          slug: product.slug,
          title: product.title,
          brand: product.brand,
          photo: product.photo,
          image: product.image,
          pricePaise: price.amount,
          savedAt: Date.now(),
        },
        ...current,
      ];
    });
    return saved;
  }, [setItems]);

  const api = useMemo<WishlistApi>(
    () => ({
      items,
      count: items.length,
      ready,
      has: (slug) => items.some((i) => i.slug === slug),
      toggle,
      remove,
      clear: () => setItems([]),
    }),
    [items, ready, toggle, remove, setItems],
  );

  return (
    <WishlistContext.Provider value={api}>{children}</WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistApi {
  const api = useContext(WishlistContext);
  if (!api) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return api;
}
