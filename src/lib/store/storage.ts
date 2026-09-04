/**
 * Browser-persisted state, safely.
 *
 * Everything the storefront keeps client-side — cart, wishlist, recent
 * searches, draft projects — goes through here rather than touching
 * `localStorage` directly, for three reasons that each bit us once:
 *
 *  1. **It throws.** Safari in private browsing, and any browser with
 *     site data blocked, raise on `setItem`. An unguarded write in a
 *     reducer takes the whole page down.
 *  2. **It is not there during SSR.** These stores are read in effects,
 *     but a helper that assumes `window` makes that a rule nobody can see.
 *  3. **The shape changes.** A cart line written by last month's build
 *     and read by this one is the classic source of "cannot read
 *     properties of undefined" in production. Every payload is versioned,
 *     and a version mismatch is discarded rather than migrated — a stale
 *     cart is a small loss, a corrupt one is a support ticket.
 *
 * None of this is the eventual home for any of it. Cart and projects
 * belong on the server against the signed-in account; the read/write pair
 * below is deliberately async-shaped in the callers so that swap is a
 * change of implementation rather than of every component.
 */

const PREFIX = "quoin";

interface Envelope<T> {
  v: number;
  data: T;
}

export function readStore<T>(key: string, version: number, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}:${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (parsed?.v !== version) return fallback;
    return parsed.data ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStore<T>(key: string, version: number, data: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${PREFIX}:${key}`,
      JSON.stringify({ v: version, data } satisfies Envelope<T>),
    );
  } catch {
    /* Quota exceeded, or storage denied. The in-memory state is still
       correct for this session, which is the important half. */
  }
}

export function clearStore(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${PREFIX}:${key}`);
  } catch {
    /* See above. */
  }
}
