"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Close } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * A panel that slides in over the page.
 *
 * One component, two sides, because a filter panel on a desktop and the
 * same filter panel on a phone are the same object in two places: `right`
 * on a wide screen, `bottom` as a sheet on a narrow one. Callers pass
 * `side="responsive"` to get exactly that, rather than mounting two
 * drawers and hiding one.
 *
 * What it has to get right, and what most hand-rolled drawers do not:
 *
 *  - **Focus is trapped while open** and returned to whatever opened it on
 *    close. Without the return, closing a cart drawer drops keyboard focus
 *    onto `<body>` and the next Tab starts from the top of the page.
 *  - **The page behind does not scroll.** Locking `overflow` alone causes
 *    a layout shift the width of the scrollbar on a desktop, so the width
 *    is measured and replaced as padding.
 *  - **Escape closes it**, and the scrim is a real button so a screen
 *    reader can find the way out too.
 *  - **It is a portal**, so an ancestor with `overflow: hidden` or a
 *    stacking context cannot clip or bury it. Rails and sticky headers
 *    create both of those all over this app.
 */

type Side = "right" | "bottom" | "responsive";

export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional line under the title; also the accessible description. */
  description?: string;
  side?: Side;
  children: ReactNode;
  /** Sticky action area pinned to the foot of the panel. */
  footer?: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  /* Remember what had focus before the drawer took it, restore after. */
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    return () => opener.current?.focus?.();
  }, [open]);

  /* Lock the page. `paddingRight` compensates for the scrollbar that
     disappears with `overflow: hidden`, which otherwise shifts the whole
     layout left by 15px the instant the drawer opens. */
  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
    };
  }, [open]);

  /* Escape closes; Tab is confined to the panel. Both on one listener so
     there is a single place where the drawer's keyboard contract lives. */
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;

      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Move focus into the panel once it exists, so the first Tab lands
     inside rather than back at the top of the document. */
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const sideClasses =
    side === "bottom"
      ? "inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl anim-slide-up"
      : side === "right"
        ? "inset-y-0 right-0 w-full max-w-md anim-slide-right"
        : /* responsive: a sheet on a phone, a side panel from `sm` up. */
          "inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl anim-slide-up " +
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-t-none sm:anim-slide-right";

  return createPortal(
    <div className="fixed inset-0 z-100">
      {/* A real button, not a div with onClick: the scrim is the primary
          way most people close this, and it has to be reachable without a
          mouse. It is last in the tab order and labelled. */}
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="anim-fade absolute inset-0 cursor-default bg-scrim backdrop-blur-[2px]"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={description ? "drawer-desc" : undefined}
        tabIndex={-1}
        data-focus-inset
        className={cn(
          "absolute flex flex-col bg-bg shadow-xl outline-none",
          sideClasses,
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-title-sm font-semibold text-ink">{title}</h2>
            {description && (
              <p id="drawer-desc" className="mt-0.5 text-caption text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <Close className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {footer && (
          <footer className="safe-bottom-0 border-t border-line-soft bg-surface px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
