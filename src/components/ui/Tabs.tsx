"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A tab strip.
 *
 * Implements the ARIA tabs pattern properly, which mostly means the arrow
 * keys move between tabs and Tab does not: a strip of ten tabs that each
 * take a tab stop puts ten presses between the navigation and the panel.
 * Only the selected tab is in the tab order; the rest are reachable with
 * ← and →, which is what a screen reader user expects here.
 *
 * Stateless. The caller owns which tab is active, because on most pages
 * that state also belongs in the URL.
 */

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  /** Right-aligned count, e.g. the number of items in a section. */
  count?: number;
  icon?: ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  variant = "underline",
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Names the strip for assistive technology. */
  label: string;
  variant?: "underline" | "segmented";
  className?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const index = items.findIndex((i) => i.id === value);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowLeft"
            ? (index - 1 + items.length) % items.length
            : (index + 1) % items.length;

    onChange(items[next].id);
    /* Move focus with selection, or the keyboard user's focus stays on a
       tab that is no longer the current one. */
    strip.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  }

  if (variant === "segmented") {
    return (
      <div
        ref={strip}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          "inline-flex rounded-lg border border-line-soft bg-sunk p-1",
          className,
        )}
      >
        {items.map((item) => {
          const on = item.id === value;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-md px-3 text-caption font-medium transition-colors",
                on
                  ? "bg-surface text-ink shadow-xs"
                  : "text-muted hover:text-ink",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "no-scrollbar flex gap-1 overflow-x-auto border-b border-line-soft",
        className,
      )}
    >
      {items.map((item) => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex min-h-11 shrink-0 items-center gap-2 px-3 text-body font-medium transition-colors",
              on ? "text-accent" : "text-muted hover:text-ink",
            )}
          >
            {item.icon}
            {item.label}
            {item.count != null && (
              <span className="nums text-micro text-faint">{item.count}</span>
            )}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors",
                on ? "bg-accent" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
