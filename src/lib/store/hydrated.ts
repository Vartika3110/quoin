"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the component has hydrated on the client.
 *
 * The problem this solves: several stores here live in `localStorage`,
 * which the server cannot read. The obvious implementation — `useState`
 * plus a `useEffect` that reads storage and calls `setState` — renders
 * one tree, then immediately renders a second, on every mount. React 19's
 * `react-hooks/set-state-in-effect` rule flags exactly that, and it is
 * right to: it is a cascading render, and it is avoidable.
 *
 * `useSyncExternalStore` is the primitive built for it. The server
 * snapshot is `false`, the client snapshot is `true`, and React swaps them
 * once — after hydration, without a state update and without a mismatch
 * warning, because it knows the two are meant to differ.
 *
 * The subscribe function never fires, and must be module-level: a new
 * function identity on every render makes React resubscribe every time.
 */
const NEVER_CHANGES = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}
