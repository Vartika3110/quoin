"use client";

import { useEffect, useRef } from "react";
import { track, type AnalyticsEvent, type AnalyticsProps } from "@/lib/analytics";

/**
 * Fires one analytics event when a server-rendered page mounts.
 *
 * Server components cannot call `track` — it lives on `window` — so a page
 * that should count as viewed renders this. The ref keeps a re-render from
 * counting twice.
 */
export function TrackEvent({ event, props }: { event: AnalyticsEvent; props?: AnalyticsProps }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(event, props);
  }, [event, props]);
  return null;
}
