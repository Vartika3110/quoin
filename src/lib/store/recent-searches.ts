import { readStore, writeStore } from "@/lib/store/storage";

/**
 * The last few things this browser searched for.
 *
 * Capped at eight. A recent-search list long enough to scroll is a list
 * nobody reads, and the value of the feature is entirely in the top two
 * or three entries.
 *
 * Plain functions rather than a provider: nothing re-renders when this
 * changes except the search palette, which reads it on open.
 */

const STORE_KEY = "recent-searches";
const STORE_VERSION = 1;
const LIMIT = 8;

export function readRecentSearches(): string[] {
  return readStore<string[]>(STORE_KEY, STORE_VERSION, []);
}

export function pushRecentSearch(term: string): string[] {
  const trimmed = term.trim();
  if (trimmed.length < 2) return readRecentSearches();

  const current = readRecentSearches();
  /* Case-insensitive de-duplication, but the new casing wins — someone
     who just typed "Jaquar" should not see their own "jaquar" back. */
  const next = [
    trimmed,
    ...current.filter((t) => t.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, LIMIT);

  writeStore(STORE_KEY, STORE_VERSION, next);
  return next;
}

export function clearRecentSearches(): string[] {
  writeStore<string[]>(STORE_KEY, STORE_VERSION, []);
  return [];
}
