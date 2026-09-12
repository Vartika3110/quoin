"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Boards, Check, Trash } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { formatPrice } from "@/lib/types/catalog";
import type { MoodboardView, SpaceItemView } from "@/lib/types/studio";

/**
 * The canvas.
 *
 * ## Coordinates
 *
 * Everything is stored in the board's own units — 1200 × 900 by default —
 * and rendered as a percentage of the container. That is what makes a
 * board arranged on a 27-inch monitor readable on a phone: the canvas
 * scales, and nothing reflows. Storing pixels instead would mean a board
 * only looks right at the width it was made at.
 *
 * ## What is draggable, and where
 *
 * Pointer events, not HTML5 drag-and-drop: DnD has no touch support at
 * all, fires a different event sequence in every browser, and cannot be
 * constrained to a container without a drag image following the cursor
 * off the edge of it. `setPointerCapture` gives one code path for mouse,
 * trackpad and finger.
 *
 * On a phone the canvas is read-only and says so. A 340px-wide board with
 * eight overlapping tiles is not something anyone can arrange with a
 * thumb, and pretending otherwise means every scroll becomes an
 * accidental drag. Adding and removing still work there; only the
 * positioning is desktop-only.
 *
 * ## Saving
 *
 * Explicit, not on every drag. A pointer move fires sixty times a second
 * and a request per frame is absurd; a debounce would still write while
 * someone is mid-thought. A Save button that lights up when there is
 * something to save is honest about a canvas being a document.
 */
const GRID = { width: 1200, height: 900 };

interface Placement {
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export function Moodboard({
  spaceId,
  board,
  items,
  canEdit,
}: {
  spaceId: string;
  board: MoodboardView | null;
  /** Everything in the room, so anything not yet on the canvas can be
      added to it. */
  items: SpaceItemView[];
  canEdit: boolean;
}) {
  const toast = useToast();
  const surface = useRef<HTMLDivElement>(null);

  const [placements, setPlacements] = useState<Placement[]>(
    () =>
      board?.items.map((i) => ({
        itemId: i.itemId,
        x: i.x,
        y: i.y,
        width: i.width,
        height: i.height,
        z: i.z,
      })) ?? [],
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const byId = new Map(items.map((item) => [item.id, item]));
  const placed = new Set(placements.map((p) => p.itemId));
  const unplaced = items.filter((item) => !placed.has(item.id));

  /* Warns before a navigation loses an arrangement. Only while there is
     something to lose — an unconditional handler makes every link on the
     page prompt. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const add = useCallback((item: SpaceItemView) => {
    setPlacements((current) => {
      /* Dropped in a loose diagonal rather than all at the origin, so
         adding five things does not make one pile. */
      const step = current.length % 6;
      return [
        ...current,
        {
          itemId: item.id,
          x: 60 + step * 70,
          y: 60 + step * 50,
          width: item.kind === "color" ? 140 : 320,
          height: item.kind === "color" ? 140 : item.kind === "note" ? 140 : 240,
          z: current.length,
        },
      ];
    });
    setDirty(true);
  }, []);

  const remove = useCallback((itemId: string) => {
    setPlacements((current) => current.filter((p) => p.itemId !== itemId));
    setSelected(null);
    setDirty(true);
  }, []);

  /**
   * Drag, in canvas units.
   *
   * The offset between the pointer and the tile's own origin is captured
   * once, on pointer-down, and subtracted from every subsequent position.
   * Without it the tile jumps so its top-left corner sits under the
   * cursor the instant a drag starts.
   */
  function onPointerDown(event: React.PointerEvent, placement: Placement) {
    if (!canEdit) return;

    const box = surface.current?.getBoundingClientRect();
    if (!box) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(placement.itemId);

    const scaleX = GRID.width / box.width;
    const scaleY = GRID.height / box.height;
    const grabX = (event.clientX - box.left) * scaleX - placement.x;
    const grabY = (event.clientY - box.top) * scaleY - placement.y;

    const move = (moveEvent: PointerEvent) => {
      const nextX = (moveEvent.clientX - box.left) * scaleX - grabX;
      const nextY = (moveEvent.clientY - box.top) * scaleY - grabY;

      setPlacements((current) =>
        current.map((p) =>
          p.itemId === placement.itemId
            ? {
                ...p,
                /* Clamped so a tile cannot be dragged off the canvas and
                   left somewhere nobody can reach it again. */
                x: Math.round(clamp(nextX, 0, GRID.width - p.width)),
                y: Math.round(clamp(nextY, 0, GRID.height - p.height)),
              }
            : p,
        ),
      );
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDirty(true);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Resize from the corner. Same capture, one axis pair. */
  function onResizeDown(event: React.PointerEvent, placement: Placement) {
    if (!canEdit) return;
    event.stopPropagation();

    const box = surface.current?.getBoundingClientRect();
    if (!box) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const scaleX = GRID.width / box.width;
    const scaleY = GRID.height / box.height;

    const move = (moveEvent: PointerEvent) => {
      const nextW = (moveEvent.clientX - box.left) * scaleX - placement.x;
      const nextH = (moveEvent.clientY - box.top) * scaleY - placement.y;

      setPlacements((current) =>
        current.map((p) =>
          p.itemId === placement.itemId
            ? {
                ...p,
                width: Math.round(clamp(nextW, 80, GRID.width - p.x)),
                height: Math.round(clamp(nextH, 80, GRID.height - p.y)),
              }
            : p,
        ),
      );
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDirty(true);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Keyboard nudging, so the canvas is not pointer-only. 20 units a
      press, 100 with Shift. */
  function onKeyDown(event: React.KeyboardEvent, placement: Placement) {
    if (!canEdit) return;
    const step = event.shiftKey ? 100 : 20;

    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(placement.itemId);
      return;
    }

    const move = delta[event.key];
    if (!move) return;

    event.preventDefault();
    setPlacements((current) =>
      current.map((p) =>
        p.itemId === placement.itemId
          ? {
              ...p,
              x: Math.round(clamp(p.x + move[0], 0, GRID.width - p.width)),
              y: Math.round(clamp(p.y + move[1], 0, GRID.height - p.height)),
            }
          : p,
      ),
    );
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/v1/studio/spaces/${spaceId}/moodboard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        /* The whole board, every time. See `saveMoodboardLayout` for why
           a delta loses a race that dragging reliably produces. */
        body: JSON.stringify({ items: placements, canvas: GRID }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not save");

      setDirty(false);
      toast.success("Moodboard saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Boards className="size-6" />}
        title="Nothing to arrange yet"
        action={{ href: "/studio", label: "Find inspiration" }}
      >
        Save ideas, products and colours into this space first — anything in
        it can go on the moodboard.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-muted">
            <span className="hidden lg:inline">
              Drag to move, pull the corner to resize, arrow keys to nudge.
            </span>
            <span className="lg:hidden">
              Arranging works on a larger screen. Add and remove here.
            </span>
          </p>

          <Button onClick={save} disabled={!dirty || saving} size="sm">
            {saving ? <Spinner className="size-4" /> : <Check className="size-4" />}
            {dirty ? "Save layout" : "Saved"}
          </Button>
        </div>
      ) : null}

      <div
        ref={surface}
        className="relative w-full overflow-hidden rounded-card border border-line-soft bg-surface shadow-xs"
        /* The canvas keeps its ratio at every width, which is what makes
           percentage coordinates mean the same thing everywhere. */
        style={{ aspectRatio: `${GRID.width} / ${GRID.height}` }}
      >
        {placements.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-body-sm text-faint">
            Add something from below to start the board.
          </p>
        ) : null}

        {placements.map((placement) => {
          const item = byId.get(placement.itemId);
          if (!item) return null;

          return (
            <div
              key={placement.itemId}
              role={canEdit ? "button" : undefined}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? `${item.title || item.kind}, drag to move` : undefined}
              onPointerDown={(event) => onPointerDown(event, placement)}
              onKeyDown={(event) => onKeyDown(event, placement)}
              onFocus={() => setSelected(placement.itemId)}
              className={cn(
                "absolute overflow-hidden rounded-lg outline-none",
                canEdit && "cursor-grab active:cursor-grabbing",
                selected === placement.itemId
                  ? "ring-2 ring-accent"
                  : "ring-1 ring-line-soft",
              )}
              style={{
                left: `${(placement.x / GRID.width) * 100}%`,
                top: `${(placement.y / GRID.height) * 100}%`,
                width: `${(placement.width / GRID.width) * 100}%`,
                height: `${(placement.height / GRID.height) * 100}%`,
                zIndex: placement.z,
                /* The browser must not claim a drag gesture as a scroll
                   while a pointer is down on a tile. */
                touchAction: canEdit ? "none" : undefined,
              }}
            >
              <Tile item={item} />

              {canEdit && selected === placement.itemId ? (
                <>
                  <button
                    type="button"
                    onClick={() => remove(placement.itemId)}
                    aria-label={`Remove ${item.title || item.kind} from the board`}
                    /* `bg-surface/90`, not `bg-plate`: a tile can be a room
                       photograph of any colour, and `tap-target` grows the
                       28px circle to a real touch target without resizing
                       it, the same trick `IdeaCard`'s save button uses. */
                    className="tap-target absolute right-1 top-1 grid size-7 place-items-center rounded-full border border-line-soft bg-surface/90 text-ink shadow-sm backdrop-blur-sm hover:bg-danger-wash hover:text-danger"
                  >
                    <Trash className="size-3.5" />
                  </button>

                  <span
                    onPointerDown={(event) => onResizeDown(event, placement)}
                    aria-hidden
                    className="absolute bottom-0 right-0 size-5 cursor-nwse-resize rounded-tl-md bg-accent/80"
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {canEdit && unplaced.length > 0 ? (
        <div>
          <p className="mb-2 text-eyebrow uppercase text-faint">
            In this space, not on the board
          </p>
          <ul className="flex flex-wrap gap-2">
            {unplaced.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => add(item)}
                  className="flex min-h-10 items-center gap-2 rounded-full border border-line-soft bg-surface px-3 text-body-sm text-muted transition-colors hover:border-accent-edge hover:bg-accent-wash hover:text-accent"
                >
                  {item.kind === "color" && item.hex ? (
                    <span
                      className="size-4 rounded-full border border-line-soft"
                      style={{ backgroundColor: item.hex }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="max-w-40 truncate">
                    {item.title || item.idea?.title || item.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** One thing, drawn. Five kinds, five renderings, no shared "card". */
function Tile({ item }: { item: SpaceItemView }) {
  if (item.kind === "idea" && item.idea) {
    return (
      <IdeaImage
        src={item.idea.imageUrl}
        alt={item.idea.title}
        width={item.idea.width}
        height={item.idea.height}
        blurDataUrl={item.idea.blurDataUrl}
        sizes="(min-width: 1024px) 30vw, 90vw"
        className="pointer-events-none h-full w-full object-cover"
      />
    );
  }

  if (item.kind === "color") {
    return (
      <div
        className="flex h-full w-full items-end p-2"
        style={{ backgroundColor: item.hex ?? "#ffffff" }}
      >
        {/* `bg-surface/90`, not `bg-plate`: the swatch behind this label is
            whatever hex someone picked, and `plate` cannot promise contrast
            against a colour it does not know. */}
        <span className="rounded bg-surface/90 px-1.5 py-0.5 text-micro font-medium text-ink backdrop-blur-sm">
          {item.title || item.hex}
        </span>
      </div>
    );
  }

  if (item.kind === "note") {
    return (
      /* The tile tints are CSS variables rather than Tailwind colours —
         `QuickActions` consumes them the same way. A hard-coded tint here
         would stay light after dark; the token restates itself. */
      <div
        className="flex h-full w-full items-center p-3"
        style={{ background: "var(--quoin-tile-4)" }}
      >
        <p className="font-display text-body-lg leading-snug text-ink">{item.title}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col justify-between bg-surface p-3">
      <p className="line-clamp-3 text-body-sm font-medium text-ink">{item.title}</p>
      <div>
        {item.brand ? (
          <p className="truncate text-caption text-faint">{item.brand}</p>
        ) : null}
        {item.unitPricePaise > 0 ? (
          <p className="nums text-body-sm font-semibold text-accent">
            {formatPrice(item.unitPricePaise)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
