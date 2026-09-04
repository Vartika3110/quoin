"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/store/hydrated";
import { Close } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * A centred dialog.
 *
 * Distinct from `Drawer` by intent rather than geometry: a drawer holds a
 * task you came to do (a cart, a filter panel) and a modal interrupts to
 * ask one question. Anything that would need scrolling belongs in a
 * drawer, which is why this has no scroll container of its own beyond a
 * cap on its height.
 *
 * Shares the drawer's keyboard contract — Escape, focus trap, focus
 * return, page lock — because two dialogs in one product that behave
 * differently under the keyboard is worse than either behaviour.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  /* Portals need a DOM to target, which the server render has not got.
     `useHydrated` answers that without a state update in an effect. */
  const mounted = useHydrated();

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    return () => opener.current?.focus?.();
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
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

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!open || !mounted) return null;

  const width =
    size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-end justify-center p-0 sm:items-center sm:p-6">
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
        aria-describedby={description ? "modal-desc" : undefined}
        tabIndex={-1}
        data-focus-inset
        className={cn(
          "anim-slide-up relative flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-surface shadow-xl outline-none",
          "sm:anim-scale-in sm:rounded-card",
          width,
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="text-title-sm font-semibold text-ink">{title}</h2>
            {description && (
              <p id="modal-desc" className="mt-1 text-body-sm leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <Close className="size-5" />
          </button>
        </header>

        {children && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        )}

        {footer && (
          <footer className="safe-bottom-0 flex flex-col-reverse gap-2 border-t border-line-soft px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
