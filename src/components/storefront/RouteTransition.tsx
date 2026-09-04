"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A short fade on every route change.
 *
 * What makes an app feel like an app rather than a website is largely that
 * screens arrive instead of appearing. React's `<ViewTransition>` would do
 * this properly — morphing a product thumbnail into the detail page's hero
 * — but it ships in React's canary channel and this project is on stable
 * 19, so it is not an option without changing a dependency. A 200ms fade
 * on the incoming screen gets most of the perceived benefit for a class
 * name.
 *
 * Keyed on **pathname only**, deliberately. `useSearchParams` would
 * re-key on every filter tap, and re-fading a product grid because
 * somebody changed the sort is exactly the kind of animation that makes an
 * interface feel slower than it is.
 *
 * The animation is `opacity` and `transform` only, so it composites on the
 * GPU and never triggers layout — and `prefers-reduced-motion` disables it
 * globally in `globals.css`, where nothing here has to know about it.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="anim-fade">
      {children}
    </div>
  );
}
