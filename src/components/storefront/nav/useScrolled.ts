"use client";

import { useEffect, useState } from "react";

/**
 * Whether the page has been scrolled past a threshold.
 *
 * Drives the header's compact state. Three details that matter more than
 * the hook looks like it should:
 *
 *  - The listener is **passive**, so it can never block scrolling. A
 *    non-passive scroll handler on the header is one of the classic
 *    causes of janky scroll on a mid-range Android.
 *  - The read is coalesced into an **animation frame**. Scroll fires far
 *    more often than the screen repaints, and `scrollY` forces layout.
 *  - State is only set when the boolean actually **flips**, so a page
 *    being scrolled does not re-render the header sixty times a second.
 *
 * The threshold defaults to 8px rather than 0: a single-pixel overscroll
 * on iOS would otherwise flicker the border on and off at rest.
 */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;

    function read() {
      frame = 0;
      setScrolled((was) => {
        const now = window.scrollY > threshold;
        return now === was ? was : now;
      });
    }

    function onScroll() {
      if (frame === 0) frame = requestAnimationFrame(read);
    }

    /* Run once on mount: a restored scroll position after a back
       navigation fires no scroll event, and the header would render
       transparent over content. */
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrolled;
}
