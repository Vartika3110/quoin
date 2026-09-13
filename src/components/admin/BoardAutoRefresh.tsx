"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How often the board re-pulls the queue. Not a websocket — orders move
    on a scale of minutes, not the sub-second latency a socket buys, and a
    plain poll has no connection to keep alive across a phone locking. */
const REFRESH_INTERVAL_MS = 30_000;

/**
 * Keeps the order board current without anyone touching it.
 *
 * Renders nothing — its only job is to call `router.refresh()` on an
 * interval, which re-runs the board's server component and lands fresh
 * data (including the "Updated hh:mm" label, which is server-rendered
 * from the same request rather than tracked here) through React's normal
 * reconciliation. Paused while the tab is hidden
 * (`document.visibilityState`) so a phone in a pocket is not silently
 * spending battery and a warehouse Wi-Fi connection refreshing a screen
 * nobody is looking at.
 */
export function BoardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
