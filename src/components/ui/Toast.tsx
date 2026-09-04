"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/store/hydrated";
import { Check, Alert, Info, Close } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * Transient confirmation.
 *
 * A toast says a thing happened that the customer cannot otherwise see —
 * an item entered a cart that is closed, an address saved on a screen that
 * did not change. It is never used for something already visible on
 * screen, and never for an error the customer has to act on, because a
 * message that disappears is a message that can be missed.
 *
 * The live region is mounted once and permanently, not created with each
 * toast. Screen readers only announce changes inside a region that existed
 * before the change; inserting the region and its content together
 * announces nothing, which is the single most common way this component
 * gets written wrong.
 */

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** One optional control, e.g. "Undo" or "View cart". */
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  toast: (message: string, options?: Partial<Omit<Toast, "id" | "message">>) => void;
  success: (message: string, action?: Toast["action"]) => void;
  error: (message: string, action?: Toast["action"]) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Long enough to read a short sentence, short enough not to sit in the way. */
const DURATION = 4000;
/** Beyond three, the stack is taller than it is useful. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, options?: Partial<Omit<Toast, "id" | "message">>) => {
      const id = nextId.current++;
      setToasts((current) =>
        [...current, { id, tone: options?.tone ?? "info", message, action: options?.action }].slice(
          -MAX_VISIBLE,
        ),
      );
      window.setTimeout(() => dismiss(id), DURATION);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (message, action) => push(message, { tone: "success", action }),
      error: (message, action) => push(message, { tone: "error", action }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Throws when used outside the provider rather than returning a no-op.
 * A silent no-op means a confirmation that never appears and nothing in
 * the console to say why.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const TONE: Record<ToastTone, { icon: ReactNode; ring: string }> = {
  success: { icon: <Check className="size-4" />, ring: "text-success" },
  error: { icon: <Alert className="size-4" />, ring: "text-danger" },
  info: { icon: <Info className="size-4" />, ring: "text-accent" },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  /* The portal target does not exist during the server render. */
  const mounted = useHydrated();
  if (!mounted) return null;

  return createPortal(
    <div
      /* `polite`, not `assertive`: a toast never interrupts. Mounted
         empty and always present so additions are announced. */
      role="status"
      aria-live="polite"
      aria-atomic="false"
      /* Above the tab bar *and* the floating cart bar on a phone, which
         together occupy about 128px — a toast that lands behind the cart
         bar is a confirmation nobody sees. Bottom-right on a desktop,
         where the corner is empty.

         `pointer-events-none` on the stack so a toast never blocks the
         page under it; the cards re-enable it for their own controls. */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 px-4 pb-32 sm:inset-x-auto sm:right-6 sm:items-end sm:pb-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="anim-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-line-soft bg-surface px-4 py-3 shadow-lg"
        >
          <span className={cn("mt-0.5 shrink-0", TONE[t.tone].ring)}>
            {TONE[t.tone].icon}
          </span>
          <p className="min-w-0 flex-1 text-body-sm leading-snug text-ink">
            {t.message}
          </p>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                onDismiss(t.id);
              }}
              className="shrink-0 text-caption font-semibold text-accent hover:text-accent-bright"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            className="-my-1 -mr-1 shrink-0 rounded-md p-1 text-faint transition-colors hover:text-ink"
          >
            <Close className="size-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
