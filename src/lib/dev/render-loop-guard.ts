"use client";

import { useEffect, useRef } from "react";

/**
 * Says "this component is in a render loop" instead of letting the tab
 * hang.
 *
 * Phase 0 of the launch brief was two reports of the renderer going
 * unresponsive — the Studio boards tab and checkout — and what made them
 * expensive was not the bug, it was the symptom. A runaway render
 * presents as a frozen browser and nothing else: no error, no stack, no
 * component name, nothing in the console. The tab is simply gone, and
 * every report of it reads the same however different the causes are.
 *
 * The point is not to *stop* a loop. A guard that silently broke the
 * cycle would hide the bug, and the fix is always in the component. The
 * point is that the next one names itself, once, so a report arrives as
 * "StudioProvider looped" rather than "the site froze".
 *
 * ## It counts commits, not renders
 *
 * Two different failures wear the same face, and only one of them is
 * silent:
 *
 *  - A `setState` *during render* re-renders without committing, and
 *    React already catches it — "Too many re-renders" names the
 *    component and stops. Nothing to add.
 *  - An **effect** that writes the state its own dependencies read
 *    commits every cycle, forever, and React says nothing at all,
 *    because each individual pass is legitimate. That is the one that
 *    eats the tab, and it is the shape both Phase 0 reports describe.
 *
 * So this runs *as* an effect with no dependency array — once per commit
 * — and a loop is a burst of commits with no paint in between. Doing it
 * in the render body instead would mean reading a ref during render,
 * which is impure and which `react-hooks/refs` rejects for good reason.
 *
 * ## The threshold
 *
 * A render loop is unbounded; a legitimate cascade is not. Twenty
 * commits inside one frame, with no interaction and no network between
 * them, is already worth reading about even if it terminates — nothing
 * in this app does it, since a click settles in two or three and a
 * resolving fetch adds one.
 *
 * The window is a frame rather than a total, because "many commits over
 * a session" is ordinary and "many commits before the browser could
 * paint" is the actual failure.
 *
 * ## Production
 *
 * The body is behind `process.env.NODE_ENV !== "production"`, which the
 * bundler folds at build time, leaving a hook that allocates one ref and
 * an effect that returns immediately. It is not removed outright because
 * removing a hook conditionally would change hook order.
 *
 * It warns once. A loop that logged every commit would put a hundred
 * thousand lines into the console and take the devtools down with the
 * page.
 */
export const WINDOW_MS = 16;
export const LIMIT = 20;

export interface CommitWindow {
  /** When the current window opened, on the `performance.now` clock. */
  start: number;
  commits: number;
  warned: boolean;
}

export function newCommitWindow(): CommitWindow {
  return { start: 0, commits: 0, warned: false };
}

/**
 * Folds one commit into the window and says whether to speak up.
 *
 * Pure, exported and mutating only the state handed to it, so the
 * decision can be tested without a DOM — which matters more here than
 * for most code: a guard that never fires is no guard, and one that
 * fires during ordinary use is worse than none, because the next person
 * learns to ignore it. `tests/unit.test.mts` pins both edges.
 */
export function recordCommit(state: CommitWindow, now: number): boolean {
  if (state.warned) return false;

  if (now - state.start > WINDOW_MS) {
    state.start = now;
    state.commits = 1;
    return false;
  }

  state.commits += 1;
  if (state.commits <= LIMIT) return false;

  state.warned = true;
  return true;
}

export function useRenderLoopGuard(label: string): void {
  /* One object rather than three refs: `StickyBarProvider` wraps the
     whole app, so this is on a hot path. */
  const state = useRef(newCommitWindow());

  /* No dependency array on purpose — this has to run after every commit,
     which is the thing being counted. */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!recordCommit(state.current, performance.now())) return;

    /* `console.error`, not `warn`: this is never a style question, and
       Next's dev overlay surfaces errors where a warning scrolls past. */
    console.error(
      `[quoin] ${label} committed ${state.current.commits} times within ` +
        `${WINDOW_MS}ms — this is a render loop, and the page is about to ` +
        `stop responding.\n` +
        `Look for an effect that writes the state its own dependency list ` +
        `reads, or a context value whose functions are rebuilt whenever ` +
        `that state changes. See the note on \`claim\` in StickyBar.tsx: ` +
        `that was exactly this bug.`,
    );
  });
}
