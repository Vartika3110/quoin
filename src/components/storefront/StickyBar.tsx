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
 * **It sits on the bottom edge, and the tab bar stands down for it.** It
 * used to be offset upwards by the tab bar's height — a `max()` of two
 * `env()` expressions, because a device with a gesture bar, one with a
 * home button and an Android with on-screen keys are three different
 * numbers no fixed value satisfies. That offset is gone along with the
 * stacking it existed for: `MobileTabBar` returns null while any bar is
 * mounted here, so there is nothing underneath to clear and the two are
 * never on screen together. What is left is `safe-bottom-0`, which is
 * only the home indicator.
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
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /**
   * `false` for a bar whose children are the full-bleed targets — the
   * browse bar's two 52px halves, which meet at a divider and run to both
   * edges.
   *
   * A prop rather than `px-0 py-0` from the caller, because `cn` here is
   * not `tailwind-merge`: `className` goes last in the *attribute*, but
   * Tailwind emits `py-0` before `py-3` in the stylesheet, so the padding
   * wins on source order and the override silently does nothing. It did.
   */
  padded?: boolean;
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
        "fixed inset-x-0 bottom-0 z-30",
        "flex items-center border-t border-line-soft bg-bg/95 backdrop-blur-xl",
        /* The home indicator is added to whatever bottom padding the bar
           already has, rather than applied by a `.safe-bottom-0` class
           alongside it: two rules setting `padding-bottom` resolve by
           stylesheet order, not by the order they are written here, and
           `cn` does not merge. One declaration per case leaves nothing to
           resolve. The underscores are load-bearing — `calc()` needs
           whitespace around `+`, Tailwind forbids literal spaces inside
           `[...]`, and `_` is how it writes one. */
        padded
          ? "gap-3 px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]"
          : "pb-[env(safe-area-inset-bottom)]",
        "lg:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
