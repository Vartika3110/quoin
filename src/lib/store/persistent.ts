"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readStore, writeStore } from "@/lib/store/storage";

/**
 * A `localStorage`-backed value, read the way React wants external state
 * read.
 *
 * Each store is created once at module scope and shared by every component
 * that uses it, which buys three things the previous
 * provider-plus-effect arrangement did not have:
 *
 *  - **No cascading render.** `useSyncExternalStore` swaps the server
 *    snapshot for the client one during hydration rather than by calling
 *    `setState` inside an effect.
 *  - **Cross-tab sync, free.** The `storage` event fires in *other* tabs,
 *    so adding to the cart on one and opening the cart on another no
 *    longer shows a stale basket.
 *  - **One cached parse.** `getSnapshot` must return a referentially
 *    stable value or React re-renders forever, so the parsed value is
 *    cached and only re-read when something actually writes.
 *
 * The server snapshot is a single frozen constant per store, for the same
 * referential-stability reason — returning a fresh `[]` each call is the
 * classic way this hook turns into an infinite loop.
 */
export interface PersistentStore<T> {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (next: T | ((current: T) => T)) => void;
  key: string;
}

export function createPersistentStore<T>(
  key: string,
  version: number,
  empty: T,
): PersistentStore<T> {
  const listeners = new Set<() => void>();

  /* `undefined` means "not read yet". Filled on first snapshot and
     invalidated by any write, here or in another tab. */
  let cache: T | undefined;

  function read(): T {
    if (cache === undefined) cache = readStore<T>(key, version, empty);
    return cache;
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  function subscribe(onChange: () => void) {
    listeners.add(onChange);

    /* Fired by other tabs only, which is exactly the case that needs it. */
    function onStorage(event: StorageEvent) {
      if (event.key !== `quoin:${key}`) return;
      cache = undefined;
      onChange();
    }

    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    key,
    subscribe,
    getSnapshot: read,
    getServerSnapshot: () => empty,
    set: (next) => {
      const value =
        typeof next === "function" ? (next as (c: T) => T)(read()) : next;
      cache = value;
      writeStore(key, version, value);
      emit();
    },
  };
}

/** Reads a store, and returns a setter with the same shape as `useState`. */
export function usePersistentStore<T>(
  store: PersistentStore<T>,
): [T, (next: T | ((current: T) => T)) => void] {
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const set = useCallback(
    (next: T | ((current: T) => T)) => store.set(next),
    [store],
  );

  return [value, set];
}
