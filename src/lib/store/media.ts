"use client";

import { useSyncExternalStore } from "react";

/**
 * Breakpoint state, read the way React wants external state read.
 *
 * The masonry feed cannot be laid out in CSS. `columns` fills column one
 * to the bottom before starting column two, which puts the second
 * photograph a screen below the first and makes the tab order nonsense;
 * `grid-template-rows: masonry` is still Firefox-only. So the column
 * assignment is done in JavaScript from each tile's known aspect ratio,
 * and that needs a column *count* — which is a media query.
 *
 * `useSyncExternalStore` over `matchMedia`, and not `useState` in an
 * effect, for exactly the reasons `useHydrated` gives: the effect version
 * renders twice on every mount, and React 19's
 * `react-hooks/set-state-in-effect` rule is right to flag it.
 *
 * The server snapshot is the widest layout. A phone therefore renders a
 * five-column assignment for one frame before hydration corrects it —
 * which is invisible, because the tiles are keyed by id and only move
 * between columns, and because the images below the fold have not loaded
 * yet anyway. Guessing narrow instead would do the same thing to every
 * desktop visitor, and there are more of those looking at a wall of
 * photographs.
 */

/* Deliberately the same widths Tailwind's own `sm`/`lg`/`xl` use, so the
   column count changes at the breakpoint everything else on the page
   changes at rather than a pixel off it. */
const QUERIES = [
  { query: "(min-width: 1280px)", columns: 5 },
  { query: "(min-width: 1024px)", columns: 4 },
  { query: "(min-width: 640px)", columns: 3 },
] as const;

/** Two columns on a phone. Section 3 of the brief, and the right answer:
    one column is a scroll with no rhythm, three is a thumbnail. */
const NARROWEST = 2;

/** Module-level, so React does not resubscribe on every render. */
const lists: MediaQueryList[] = [];

function ensureLists(): MediaQueryList[] {
  if (lists.length === 0 && typeof window !== "undefined") {
    for (const { query } of QUERIES) lists.push(window.matchMedia(query));
  }
  return lists;
}

function subscribe(onChange: () => void): () => void {
  const all = ensureLists();
  for (const list of all) list.addEventListener("change", onChange);
  return () => {
    for (const list of all) list.removeEventListener("change", onChange);
  };
}

function getSnapshot(): number {
  const all = ensureLists();
  for (let i = 0; i < all.length; i++) {
    if (all[i].matches) return QUERIES[i].columns;
  }
  return NARROWEST;
}

/* A constant, not a fresh number each call. `getServerSnapshot` returning
   a new value would be fine for a primitive, but keeping it beside the
   others makes the contract obvious. */
const SERVER_COLUMNS = QUERIES[0].columns;
const getServerSnapshot = () => SERVER_COLUMNS;

export function useColumnCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The same subscription, for the handful of places that need to know
    they are on a phone rather than how many columns fit — the save sheet
    picking a side, the moodboard deciding whether to allow dragging. */
const COARSE = "(max-width: 639px)";
let coarseList: MediaQueryList | null = null;

function coarse(): MediaQueryList | null {
  if (!coarseList && typeof window !== "undefined") {
    coarseList = window.matchMedia(COARSE);
  }
  return coarseList;
}

function subscribeCoarse(onChange: () => void): () => void {
  const list = coarse();
  if (!list) return () => {};
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => coarse()?.matches ?? false,
    () => false,
  );
}
