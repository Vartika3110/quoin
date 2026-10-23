"use client";

import { useEffect, useState } from "react";

/**
 * The room photograph and the renders made from it, for this visit.
 *
 * The feature this exists for is comparison: somebody narrowing three
 * tiles down to one renders all three against the *same* photograph of
 * their floor and looks at them side by side. That cannot work if each
 * product page starts from nothing — they would have to re-upload the
 * photograph on every page, and three renders of three different floors
 * are not a comparison.
 *
 * ## Deliberately in memory, and deliberately not persisted
 *
 * No `localStorage`, no `sessionStorage`, no server. Three reasons, in
 * order of weight:
 *
 *  1. **It is a photograph of somebody's home.** `POST /api/v1/visualise`
 *     keeps nothing for exactly this reason, and a store that quietly
 *     kept a copy in the browser would undo that decision from the other
 *     side. Closing the tab ends it, which is what a customer would
 *     assume.
 *  2. **Quota.** A render is a few hundred kilobytes before base64 and
 *     several of them plus the original would be flirting with the 5MB
 *     web-storage ceiling — and a store that throws on the fourth render
 *     fails at precisely the point the feature becomes useful.
 *  3. Module state survives client-side navigation in the App Router,
 *     which is the only continuity this needs: product page to product
 *     page within one visit.
 *
 * A hard reload clears it. That is a real limitation and the UI says so
 * rather than pretending otherwise.
 *
 * Plain module state with a subscriber set rather than a React context,
 * because the things that read it are a drawer on one page and a strip on
 * another — a provider would have to wrap the whole app to serve two
 * components that are never on screen together.
 */

export interface RoomPhoto {
  /** A blob URL for the re-encoded photograph the customer chose. */
  url: string;
  /** Kept so a render can be asked for at the room's own shape. */
  width: number;
  height: number;
  /** The bytes, so a second render does not need the file picker again. */
  file: File;
}

export interface RoomRender {
  id: string;
  productSlug: string;
  productTitle: string;
  /** Data URL as returned by the API. Nothing is hosted. */
  image: string;
  placement: string;
  /** True when Quoin's own photograph of the product was used. */
  fromProductPhoto: boolean;
  createdAt: number;
}

/**
 * How many renders are kept.
 *
 * Six is well past what anybody compares at once — three is the real
 * number — and the cap exists so a long browsing session cannot hold an
 * unbounded number of decoded images in memory.
 */
const LIMIT = 6;

let photo: RoomPhoto | null = null;
let renders: RoomRender[] = [];

const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

export function setRoomPhoto(next: RoomPhoto) {
  /* The previous blob URL holds a whole decoded image alive; replacing
     the photograph without revoking it leaks one per attempt. */
  if (photo && photo.url !== next.url) URL.revokeObjectURL(photo.url);
  photo = next;
  announce();
}

export function getRoomPhoto(): RoomPhoto | null {
  return photo;
}

export function addRoomRender(render: Omit<RoomRender, "id" | "createdAt">) {
  renders = [
    { ...render, id: `${render.productSlug}-${Date.now()}`, createdAt: Date.now() },
    ...renders,
  ].slice(0, LIMIT);
  announce();
}

export function removeRoomRender(id: string) {
  renders = renders.filter((r) => r.id !== id);
  announce();
}

export function clearRoomPreview() {
  if (photo) URL.revokeObjectURL(photo.url);
  photo = null;
  renders = [];
  announce();
}

/**
 * Subscribes a component to the store.
 *
 * `useSyncExternalStore` would be the idiomatic hook, but it requires a
 * snapshot that is referentially stable between changes — and the natural
 * snapshot here is an object holding both the photo and the array, which
 * would be a new object on every render and an infinite loop. A version
 * counter bumped on change is the simpler correct thing.
 */
export function useRoomPreview(): { photo: RoomPhoto | null; renders: RoomRender[] } {
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    /* No read on subscribe. The values are read out of the module during
       render — `return { photo, renders }` below — so a change that
       landed before the subscription did is already reflected, and
       calling the listener here would be a cascading render for nothing. */
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { photo, renders };
}
