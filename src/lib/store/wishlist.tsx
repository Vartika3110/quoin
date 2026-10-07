"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
 * **Signed in, the account owns it.** Signed out it is browser-local, as
 * it always was, because there is nowhere else to put it.
 *
 * The join between the two is the part worth reading. Somebody who
 * hearts six things and then signs in has not changed their mind about
 * any of them, so the local list is *merged* into the account rather
 * than replaced or discarded — losing it at the moment someone commits
 * is the worst possible time to lose it. After the merge the local copy
 * is cleared, so a second account signing in on the same browser does
 * not inherit the first one's list.
 *
 * `toggle` still returns the new state so the caller can animate without
 * re-reading the store, and still applies locally first: a heart that
 * waits for a round trip before filling feels broken, and the request
 * that follows is a confirmation rather than the event.
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

export function WishlistProvider({
  children,
  isSignedIn = false,
}: {
  children: ReactNode;
  /** Handed down from the layout: the session cookie is httpOnly, so the
      browser cannot see it. Same arrangement `ProjectsProvider` uses. */
  isSignedIn?: boolean;
}) {
  const [local, setLocal] = usePersistentStore(store);
  const hydrated = useHydrated();

  /* The account's copy, once it has been fetched. `null` means "not yet",
     which is what keeps the list from flashing empty before it arrives. */
  const [server, setServer] = useState<WishlistItem[] | null>(null);
  const merged = useRef(false);

  /* Memoised so the `useMemo` below is not handed a new array identity on
     every render — a conditional expression returns a fresh `[]` each
     time, which would rebuild the context value and re-render every
     consumer of it. */
  const items = useMemo(
    () => (isSignedIn ? (server ?? []) : local),
    [isSignedIn, server, local],
  );
  const ready = isSignedIn ? server !== null : hydrated;

  const setItems = isSignedIn ? setServerItems : setLocal;

  function setServerItems(
    next: WishlistItem[] | ((current: WishlistItem[]) => WishlistItem[]),
  ) {
    setServer((current) =>
      typeof next === "function" ? next(current ?? []) : next,
    );
  }

  /* One pass on sign-in: push whatever the browser is holding, then take
     the account's list as the truth. `merged` guards a second run from a
     re-render — the local list is cleared below, so a repeat would push
     nothing, but the GET is still a request not worth making twice. */
  useEffect(() => {
    if (!isSignedIn || !hydrated || merged.current) return;
    merged.current = true;

    let cancelled = false;
    const slugs = local.map((i) => i.slug);

    (async () => {
      try {
        const response = await fetch("/api/v1/wishlist", {
          method: slugs.length > 0 ? "POST" : "GET",
          ...(slugs.length > 0
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ slugs }),
              }
            : {}),
        });
        const body = (await response.json().catch(() => null)) as
          | { data?: { items?: ServerProduct[] } }
          | null;
        if (cancelled || !response.ok) return;

        setServer(toItems(body?.data?.items ?? []));
        /* Handed over — the browser copy would otherwise be inherited by
           the next account to sign in here. */
        if (slugs.length > 0) setLocal([]);
      } catch {
        /* Offline, or the session expired between render and fetch. The
           list stays empty rather than showing a stale local copy as if
           it were the account's. */
        if (!cancelled) setServer([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, hydrated, local, setLocal]);

  const remove = useCallback(
    (slug: string) => {
      setItems((current) => current.filter((i) => i.slug !== slug));
      if (isSignedIn) void push("DELETE", { slug });
    },
    [setItems, isSignedIn],
  );

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
    /* Applied above, confirmed here. A heart that waits for the network
       before filling feels broken; if the request fails the next load
       reconciles, which is the right trade for a list of things somebody
       might buy rather than a payment. */
    if (isSignedIn) {
      if (saved) void push("POST", { slugs: [product.slug] });
      else void push("DELETE", { slug: product.slug });
    }
    return saved;
  }, [setItems, isSignedIn]);

  const api = useMemo<WishlistApi>(
    () => ({
      items,
      count: items.length,
      ready,
      has: (slug) => items.some((i) => i.slug === slug),
      toggle,
      remove,
      clear: () => {
        const slugs = items.map((i) => i.slug);
        setItems([]);
        if (isSignedIn) for (const slug of slugs) void push("DELETE", { slug });
      },
    }),
    [items, ready, toggle, remove, setItems, isSignedIn],
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

/** What `/api/v1/wishlist` answers with: whole products, read fresh. */
type ServerProduct = Product;

/**
 * Server products into the shape this store has always held.
 *
 * `savedAt` is a descending counter rather than a real timestamp. The API
 * returns the list already in the order the customer built it and does
 * not send dates, and nothing in the UI shows one — it is used for
 * ordering, which the array already carries.
 */
function toItems(products: ServerProduct[]): WishlistItem[] {
  return products.map((product, index) => {
    const price = resolvePrice(product, false);
    return {
      slug: product.slug,
      title: product.title,
      brand: product.brand,
      photo: product.photo,
      image: product.image,
      pricePaise: price.amount,
      savedAt: Number.MAX_SAFE_INTEGER - index,
    };
  });
}

/**
 * Fire-and-forget write.
 *
 * Deliberately not awaited by its callers and deliberately silent: the
 * change is already on screen, and a toast saying "could not save that
 * heart" is noise about a list the customer can see the state of. A
 * failed write is reconciled by the next load.
 */
async function push(method: "POST" | "DELETE", body: unknown): Promise<void> {
  try {
    await fetch("/api/v1/wishlist", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* See above. */
  }
}
