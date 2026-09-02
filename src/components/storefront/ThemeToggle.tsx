"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@/components/icons";

/** Kept in sync with the inline script in `layout.tsx`. */
const STORAGE_KEY = "quoin-theme";
/** Fired by the toggle so the store re-reads its own change. */
const CHANGED = "quoin-theme-change";

/**
 * Whether the page is currently dark, read from the document.
 *
 * The document element is the source of truth, not React state: the
 * inline script in the head sets it before anything mounts, and the
 * stylesheet falls back to the system preference when it is unset. Asking
 * the DOM keeps those three in agreement instead of racing them.
 */
function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  return chosen
    ? chosen === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  /* Both sources of a change: the visitor turning their phone dark while
     the page is open, and this control being pressed. */
  query.addEventListener("change", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/**
 * Switches between the light and dark palettes.
 *
 * The choice is written to the document element immediately and to
 * `localStorage` for the next visit. Nothing is re-rendered on the server
 * and no request is made: the palette is CSS variables, so setting one
 * attribute repaints the whole app in a frame.
 *
 * Until someone chooses, no attribute is set and the stylesheet's
 * `prefers-color-scheme` rule decides — so a visitor whose phone is dark
 * gets dark without ever touching this.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  /* The server cannot know what the browser will resolve, so it renders
     the light icon and the first client render corrects it. */
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Private browsing refuses storage; the choice still holds for the
         life of the page, which beats refusing to switch. */
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <button
      onClick={toggle}
      /* Labelled for what it does, not what it shows: a moon that says
         "moon" tells a screen reader nothing about the outcome. */
      aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
      aria-pressed={dark}
      className={`grid size-9 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-ink ${className}`}
    >
      {dark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </button>
  );
}
