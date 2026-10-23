"use client";

import { useEffect, useRef } from "react";

/**
 * Scrolls a chip rail — horizontal or vertical — to the chip that is on.
 *
 * Fourteen departments do not fit a 375px row and nine shelves do not fit
 * the height beside a product grid, so a page deep in either list opens
 * with its own chip out of view and nothing on screen reading as
 * selected. A rail that shows no active chip does not look scrolled, it
 * looks broken, and the reader's next move is to tap "All".
 *
 * **Not `scrollIntoView`.** The horizontal rails are
 * `scroll-snap-type: x proximity` with `scroll-snap-align: start` on
 * every chip, and the snap runs after the programmatic scroll: asking
 * for `inline: "nearest"` parks the chip flush against the far edge, the
 * snap then pulls the row back to the nearest chip-start, and the chip
 * that was just revealed ends up cut off by about 16px — visibly broken
 * in exactly the way this is meant to fix. So the scroll goes to a
 * position the snap already agrees with: the chip's own leading edge,
 * inset by the container's scroll-padding.
 *
 * The axis is read off the container rather than configured, because the
 * two callers differ in it and nothing else: `DepartmentRail` is a row,
 * `TypeSidebar` is a column. Whichever axis actually overflows is the one
 * scrolled; a container that overflows in neither is left alone.
 *
 * And only when it has to. A chip already fully in view stays where it
 * is — scrolling Bathware to the leading edge on arrival would push the
 * "All" chip off it for no reason.
 */
export function useActiveChipIntoView<T extends HTMLElement>(
  /** Re-runs when the active chip changes, e.g. on a filter change. */
  active: string | undefined,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    /* Measured after the browser has laid the page out, not during the
       commit that mounts it. Run synchronously, this reads a column
       whose web font has not swapped in and whose sticky height has not
       resolved: the numbers are real but they are last frame's, and the
       scroll computed from them is silently short. Two frames is the
       usual price of asking the browser a layout question and getting
       this frame's answer. */
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(reveal);
    });
    return () => cancelAnimationFrame(frame);

    function reveal() {
      const chip = ref.current;
      const rail = chip && scrollParent(chip);
      if (!chip || !rail) return;

      const style = getComputedStyle(rail);
      const chipBox = chip.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();

      if (rail.scrollWidth > rail.clientWidth) {
        /* The gutter the rail insets its contents by, read rather than
         assumed — it is `scroll-pl-5` today and this should not be the
         thing that breaks if it stops being. */
        const gutter = parseFloat(style.scrollPaddingLeft) || 0;
        const visible =
          chipBox.left >= railBox.left + gutter &&
          chipBox.right <= railBox.right;
        if (!visible) {
          rail.scrollLeft += chipBox.left - railBox.left - gutter;
        }
      }

      if (rail.scrollHeight > rail.clientHeight) {
        const gutter = parseFloat(style.scrollPaddingTop) || 0;

        /* Measured against the part of the rail that is actually on
         screen, not against its box. The sidebar is `sticky` and taller
         than the space under the header, so at the top of the page its
         lower half hangs below the fold: a chip can sit inside the
         rail's box, with the rail scrolled as far as it will go, and
         still be somewhere the reader cannot see. Intersecting with the
         viewport is the difference between "in the element" and "in
         view", and only the second one is the point. `TypeSidebar` sizes
         itself so that the two coincide; this stays correct if it ever
         stops. */
        const top = Math.max(railBox.top, 0) + gutter;
        const bottom = Math.min(railBox.bottom, window.innerHeight);

        if (chipBox.top < top || chipBox.bottom > bottom) {
          rail.scrollTop += chipBox.top - top;
        }
      }
    }
  }, [active]);

  return ref;
}

/**
 * The nearest ancestor that actually scrolls.
 *
 * Found rather than named. The first version of this looked for a
 * `.rail` class, which is the horizontal rails' own utility and is not
 * on the sidebar — so the sidebar silently never scrolled, which is the
 * failure a class-name contract invites. Reading `overflow` describes
 * the thing the code actually needs.
 *
 * Stops at the document: a chip whose only scrollable ancestor is the
 * page itself gets nothing, deliberately, because scrolling the whole
 * document to reveal a filter chip is worse than leaving it off screen.
 */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (
      /^(auto|scroll)$/.test(overflowX) ||
      /^(auto|scroll)$/.test(overflowY)
    ) {
      return el;
    }
  }
  return null;
}
