"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/components/ui/cn";

/**
 * A phone's sticky action bar.
 *
 * Sits above the fixed tab bar, never under it. The offset is the tab
 * bar's own height plus the home indicator, expressed with `env()` so it
 * is right on an iPhone with a gesture bar, an iPhone with a home button
 * and an Android with on-screen keys — three different numbers that no
 * fixed value satisfies. `max()` rather than a sum: on a device reporting
 * no inset the tab bar is 60px and on one reporting 34px it is 94px, and
 * taking the larger of the two expressions gets both without branching.
 *
 * The underscores in that arbitrary value are load-bearing. `calc()`
 * requires whitespace around `+`, Tailwind forbids literal spaces inside
 * `[...]`, and `_` is how it writes one — without them the declaration is
 * invalid, the browser drops it silently, and the bar sits directly on top
 * of the tab bar. Which is exactly what it did.
 *
 * Hidden from `lg` up, where the same content lives in a sticky column and
 * a bar pinned across a 1440px screen reads as a phone app in a window.
 *
 * **It also announces itself.** The floating cart bar occupies the same
 * strip, and two bars stacked on one another is the kind of thing that
 * only shows up on a real device with something already in the cart. Any
 * mounted `StickyBar` registers here, and `CartBar` stands down while one
 * exists — so a page with its own action bar simply wins, and no page has
 * to know about the other's existence.
 */

const StickyBarSlot = createContext<{
  taken: boolean;
  claim: () => () => void;
} | null>(null);

export function StickyBarProvider({ children }: { children: ReactNode }) {
  /* A count rather than a boolean: two bars mounting during a route
     transition would otherwise have the first one's unmount clear the
     flag the second had just set. */
  const [count, setCount] = useState(0);

  const value = useMemo(
    () => ({
      taken: count > 0,
      claim: () => {
        setCount((n) => n + 1);
        return () => setCount((n) => Math.max(0, n - 1));
      },
    }),
    [count],
  );

  return <StickyBarSlot.Provider value={value}>{children}</StickyBarSlot.Provider>;
}

/** True when some page-level sticky bar is on screen. */
export function useStickyBarTaken(): boolean {
  return useContext(StickyBarSlot)?.taken ?? false;
}

export function StickyBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const slot = useContext(StickyBarSlot);

  const claim = slot?.claim;
  /* Claims the strip on mount and releases it on unmount. `claim` is
     memoised by the provider, so this runs once per mounted bar rather
     than on every render of the page around it. */
  useEffect(() => claim?.(), [claim]);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[max(3.75rem,calc(3.25rem_+_env(safe-area-inset-bottom)))] z-30",
        "flex items-center gap-3 border-t border-line-soft bg-bg/95 px-4 py-3 backdrop-blur-xl",
        "lg:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
