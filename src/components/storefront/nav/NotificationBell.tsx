"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/components/ui/cn";
import { Bell } from "@/components/icons";
import type { NotificationView } from "@/lib/data/notifications";

/** Same `useSyncExternalStore` shape as `ThemeToggle`'s own dark-mode
    read: the server cannot know the viewport width, so it renders the
    mobile (`false`) shape and the first client render corrects it —
    never a `useState` + effect pair setting it, which is the exact
    cascading-render `react-hooks/set-state-in-effect` exists to catch. */
function subscribeDesktopQuery(onChange: () => void): () => void {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function readDesktopQuery(): boolean {
  return window.matchMedia("(min-width: 1024px)").matches;
}

/**
 * The notification bell.
 *
 * Only ever mounted for a signed-in visitor — `SiteHeader` decides that
 * from the server-rendered session, not this component, so there is no
 * moment where the bell renders and then disappears once a client check
 * catches up.
 *
 * One `open` state drives two renderings of the same panel: a bottom
 * sheet (`Drawer`) below `lg`, a small popover anchored under the button
 * from `lg` up. Both stay in the tree rather than being swapped by a
 * conditional — `Drawer` already renders nothing while its own `open` is
 * false, so `open && !isDesktop` simply never opens it above `lg`, and
 * there is one source of truth for whether the panel is showing instead
 * of two components that could disagree.
 */

const REFOCUS_INTERVAL_MS = 60_000;
const FETCH_LIMIT = 20;

type Status = "loading" | "ready" | "error";

export function NotificationBell({ buttonClassName }: { buttonClassName?: string }) {
  const router = useRouter();
  const isDesktop = useSyncExternalStore(subscribeDesktopQuery, readDesktopQuery, () => false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastFetchAt = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * The read alone — no `setState`, so calling it is safe from anywhere,
   * including directly inside an effect. Each caller below applies the
   * result itself, the same split `AddressPicker`'s own `load()`
   * (`src/components/storefront/checkout/AddressPicker.tsx`) makes for
   * exactly this reason.
   */
  async function fetchNotifications() {
    const res = await fetch(`/api/v1/notifications?limit=${FETCH_LIMIT}`);
    if (!res.ok) throw new Error("request failed");
    const body = await res.json();
    return {
      items: body.data.items as NotificationView[],
      unreadCount: body.data.unreadCount as number,
    };
  }

  /* Fetch on mount. The `ignore` guard, and doing the read inside an
     inline async IIFE rather than calling a named async helper, is the
     shape `react-hooks/set-state-in-effect` requires: a `setState` call
     is only safe here once it is provably behind this effect's own
     `await`, which the rule cannot see through a call to a function
     declared outside it. */
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const result = await fetchNotifications();
        if (ignore) return;
        setItems(result.items);
        setUnreadCount(result.unreadCount);
        setStatus("ready");
        lastFetchAt.current = Date.now();
      } catch {
        if (!ignore) setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  /** Applies a fresh read — used by the focus refetch below and by the
      error panel's "Try again", neither of which is a direct effect
      body, so calling this named function from either is not the shape
      the lint rule above exists to catch. */
  async function load() {
    try {
      const result = await fetchNotifications();
      setItems(result.items);
      setUnreadCount(result.unreadCount);
      setStatus("ready");
      lastFetchAt.current = Date.now();
    } catch {
      setStatus("error");
    }
  }

  /* Refetch on window focus, at most once a minute — a customer who tabs
     back after a while should see anything new, but every alt-tab must
     not hammer the endpoint. `load()` runs inside the listener, which
     fires later on its own call stack, not synchronously as the effect
     itself runs, which is what keeps this call (unlike the mount fetch
     above) outside what the lint rule flags. */
  useEffect(() => {
    function onFocus() {
      if (Date.now() - lastFetchAt.current >= REFOCUS_INTERVAL_MS) load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    /* `load` is intentionally not a dependency: it is redefined every
       render, and this listener is meant to be attached once, for the
       life of the component, not re-attached on every render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    setStatus("loading");
    load();
  }

  /* The desktop popover closes on an outside click or Escape. The mobile
     sheet gets both for free from `Drawer` itself. */
  useEffect(() => {
    if (!open || !isDesktop) return;
    function onPointer(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isDesktop]);

  /**
   * Marks notifications read, locally first and the server second — best
   * effort on the network call, matching `markNotificationsRead`'s own
   * spirit (`src/lib/data/notifications.ts`): a bell that stays lit for
   * one more session is a far smaller problem than a click that throws.
   */
  async function markRead(ids: string[]) {
    const newlyRead = ids.filter((id) => items.some((n) => n.id === id && !n.read));
    if (newlyRead.length === 0) return;

    setItems((current) => current.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    setUnreadCount((current) => Math.max(0, current - newlyRead.length));

    try {
      await fetch("/api/v1/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // Best-effort — see the note above.
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    setItems((current) => current.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/v1/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // Best-effort — see the note above.
    }
  }

  function openNotification(n: NotificationView) {
    if (!n.read) markRead([n.id]);
    setOpen(false);
    if (n.href) router.push(n.href);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        /* Mobile-shaped by default — a 36px bordered circle, matching
           `ThemeToggle`'s own base — with the desktop bar overriding it to
           match `CartButton`/`WishlistButton` instead. `className` wins by
           coming last in `cn()` (see its own comment on why that is
           trusted instead of a merge library). */
        className={cn(
          "relative grid size-9 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-ink",
          buttonClassName,
        )}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="nums absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Bottom sheet under `lg`. */}
      <Drawer open={open && !isDesktop} onClose={() => setOpen(false)} side="bottom" title="Notifications">
        <PanelBody
          status={status}
          items={items}
          hasUnread={unreadCount > 0}
          onMarkAll={markAllRead}
          onOpen={openNotification}
          onRetry={retry}
        />
      </Drawer>

      {/* Anchored popover from `lg`. */}
      {open && isDesktop && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="anim-rise absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-card border border-line-soft bg-surface shadow-lg"
        >
          <div className="border-b border-line-soft px-4 py-3">
            <h2 className="font-display text-title-sm font-semibold text-ink">Notifications</h2>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            <PanelBody
              status={status}
              items={items}
              hasUnread={unreadCount > 0}
              onMarkAll={markAllRead}
              onOpen={openNotification}
              onRetry={retry}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PanelBody({
  status,
  items,
  hasUnread,
  onMarkAll,
  onOpen,
  onRetry,
}: {
  status: Status;
  items: NotificationView[];
  hasUnread: boolean;
  onMarkAll: () => void;
  onOpen: (n: NotificationView) => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end px-4 py-2.5">
        <button
          type="button"
          onClick={onMarkAll}
          disabled={!hasUnread}
          className="text-caption font-medium text-accent hover:text-accent-bright disabled:pointer-events-none disabled:opacity-40"
        >
          Mark all as read
        </button>
      </div>

      {status === "loading" && (
        <div className="space-y-4 px-4 pb-4" role="status" aria-label="Loading notifications">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="px-4 pb-5">
          <ErrorState
            compact
            title="We couldn't load notifications."
            description="Check your connection and try again."
            retry={onRetry}
          />
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <p className="px-4 pb-6 pt-1 text-body-sm text-muted">You&rsquo;re all caught up.</p>
      )}

      {status === "ready" && items.length > 0 && (
        <ul className="max-h-96 divide-y divide-line-hair overflow-y-auto">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onOpen(n)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover",
                  !n.read && "bg-accent-wash/40",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-accent",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-body-sm leading-snug text-ink",
                      !n.read && "font-semibold",
                    )}
                  >
                    {n.title}
                  </span>
                  {n.body && (
                    <span className="mt-0.5 block text-caption leading-snug text-muted">
                      {n.body}
                    </span>
                  )}
                  <span className="mt-1 block text-micro text-faint">
                    {relativeTime(n.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "5 min ago", "2 days ago" — coarse on purpose. A notification panel
    is read within minutes of opening it, not down to the second. */
function relativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}
