"use client";

import { readStore, writeStore } from "@/lib/store/storage";
import { useHydrated } from "@/lib/store/hydrated";
import type { Paise, Product } from "@/lib/types/catalog";
import { resolvePrice } from "@/lib/types/catalog";

/**
 * The last few products this browser looked at.
 *
 * Not a provider: nothing re-renders when it changes except the one rail
 * that shows it, and that rail reads it on mount. A context here would put
 * a state update on every product-page view for the benefit of a component
 * that is usually not mounted.
 *
 * Capped at twelve. This is a "take me back to the one I was comparing"
 * feature, and a list long enough to scroll past the thing you wanted is a
 * list that has stopped doing that job.
 */

const STORE_KEY = "recently-viewed";
const STORE_VERSION = 1;
const LIMIT = 12;

export interface ViewedProduct {
  slug: string;
  title: string;
  brand: string | null;
  photo?: string;
  image: string;
  pricePaise: Paise;
  viewedAt: number;
}

export function readRecentlyViewed(): ViewedProduct[] {
  return readStore<ViewedProduct[]>(STORE_KEY, STORE_VERSION, []);
}

/**
 * Records a view, newest first, de-duplicated by slug.
 *
 * Re-viewing something moves it to the front rather than adding a second
 * entry — otherwise a rail of "recently viewed" is four copies of whatever
 * page was refreshed most.
 */
export function pushRecentlyViewed(product: Product): void {
  const price = resolvePrice(product, false);
  const entry: ViewedProduct = {
    slug: product.slug,
    title: product.title,
    brand: product.brand,
    photo: product.photo,
    image: product.image,
    pricePaise: price.amount,
    viewedAt: Date.now(),
  };

  const next = [
    entry,
    ...readRecentlyViewed().filter((v) => v.slug !== product.slug),
  ].slice(0, LIMIT);

  writeStore(STORE_KEY, STORE_VERSION, next);
}

/**
 * Reads the list once the client has hydrated.
 *
 * `ready` exists so a rail can render nothing rather than an empty state
 * before `localStorage` has been read — on a returning customer that frame
 * would otherwise flash "nothing here yet" over a list that is about to
 * appear.
 */
export function useRecentlyViewed(): {
  items: ViewedProduct[];
  ready: boolean;
} {
  const ready = useHydrated();

  /* Read during render rather than in an effect. Safe because the read is
     gated on `ready`, which is `false` for the server render and the
     hydrating one — so the server and the client agree on an empty list,
     and only the post-hydration render touches storage. */
  return { items: ready ? readRecentlyViewed() : [], ready };
}
