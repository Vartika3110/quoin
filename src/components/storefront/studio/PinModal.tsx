"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PinDetail } from "@/components/storefront/studio/PinDetail";
import { Close } from "@/components/icons";
import { useHydrated } from "@/lib/store/hydrated";
import type { IdeaView, SpacePinView } from "@/lib/types/studio";

/**
 * A pin, over the grid it was opened from.
 *
 * Deliberately not `ui/Modal`. That component is a *dialog*: a titled
 * header, a described body, a footer of actions, and a measure capped at
 * `max-w-2xl` because that is how wide a question should be. This is a
 * page shown over another page — 1200px of photograph and priced
 * materials, its own heading, its own sticky footer — and forcing it
 * through the dialog's header would print the room's title twice.
 *
 * What it does copy, exactly, is the dialog's keyboard contract, because
 * a second answer to "what does Escape do" is how an app starts feeling
 * unreliable: Escape closes, the backdrop closes, focus moves in on open
 * and returns to the opener on close, and the page behind cannot scroll.
 *
 * Closing is `router.back()`, not a state flag. This is an intercepted
 * route — the URL really is `/studio/pin/…` while it is open — so back is
 * both what the browser's own gesture does and what this button must do,
 * or the two disagree and one of them leaves a modal-shaped hole in the
 * history.
 */
export function PinModal({
  view,
  related,
}: {
  view: SpacePinView;
  related: IdeaView[];
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  /* Portals need a DOM to target, which the server render has not got. */
  const mounted = useHydrated();

  const close = () => router.back();

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    return () => opener.current?.focus?.();
  }, []);

  useEffect(() => {
    const { body, documentElement } = document;
    /* Compensates for the scrollbar that disappears with `overflow:
       hidden`, which otherwise shifts the whole page left by 15px the
       instant this opens. */
    const gap = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    /* `close` is a fresh closure each render and the listener is meant to
       be attached once; `router` is stable. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="anim-fade absolute inset-0 cursor-default bg-scrim backdrop-blur-[2px]"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={view.pin.title}
        tabIndex={-1}
        data-focus-inset
        className={
          /* A bottom sheet that owns almost the whole phone screen, and a
             1200×880-ish panel on a desktop. `max-h` rather than `h` at
             both sizes: a room with three materials should not be a panel
             of white space under a short list. */
          "anim-slide-up relative flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-bg shadow-xl outline-none " +
          "sm:anim-scale-in sm:max-h-[88vh] sm:max-w-[75rem] sm:rounded-card sm:bg-surface"
        }
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="tap-target absolute right-3 top-3 z-30 hidden size-10 place-items-center rounded-full bg-plate-solid text-ink shadow-md transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:grid"
        >
          <Close className="size-5" />
        </button>

        <div className="p-0 sm:p-5 lg:p-6">
          <PinDetail view={view} related={related} onClose={close} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
