"use client";

import { useCallback } from "react";
import { StudioVideo, type StudioVideoHandle } from "@/components/storefront/studio/StudioVideo";
import { cn } from "@/components/ui/cn";
import { formatPrice, PRICING_UNIT_LABEL } from "@/lib/types/catalog";
import { activeAt, type IdeaView, type PinVideo, type RoomMaterial } from "@/lib/types/studio";
import type { RefObject } from "react";

/**
 * The clip, with the line it is currently showing named over it.
 *
 * `HotspotPhoto` is the sibling and the contract is deliberately
 * identical — `selected` is a line's `number`, either half can set it,
 * and the dot and the row are the same number. What changes is who sets
 * it most of the time: on a photograph a person does, and on a clip the
 * clip does, second by second, through `activeAt`.
 *
 * **One dot, not forty.** A still can carry every dot at once because
 * nothing on it moves. A clip cannot: a coordinate is true of one frame,
 * and forty dots pinned over a moving pan is forty dots sliding across
 * the wrong objects. So only the *current* line's dot is drawn, and only
 * while it is current.
 *
 * A line with a coordinate but no `atSeconds` is therefore never drawn
 * here at all. It is still in the list, still numbered, still priced —
 * it simply has no frame it is true of, and guessing one would put a dot
 * on a tap that is a wall by the time the viewer looks.
 *
 * The chip under the dot is the part that does the work on a phone. A
 * 28px dot on a clip playing at arm's length is a target nobody hits and
 * a label nobody reads; the chip says the product, the brand and the
 * price in words, sits where a thumb already is, and selects the same
 * line the dot does.
 */
export function HotspotVideo({
  pin,
  video,
  materials,
  selected,
  onSelect,
  handleRef,
  fill = false,
  active = true,
  className,
}: {
  pin: IdeaView;
  video: PinVideo;
  materials: RoomMaterial[];
  selected: number | null;
  onSelect: (n: number | null) => void;
  /** Handed down so the materials list can seek this clip. */
  handleRef?: RefObject<StudioVideoHandle | null>;
  fill?: boolean;
  active?: boolean;
  className?: string;
}) {
  /* The clip drives the selection. `onTime` fires once per whole second
     — see `StudioVideo` — so this is a comparison and a call a second,
     not a re-render per frame. Setting it only on a *change* is what
     keeps a viewer's own tap on row 9 from being overwritten half a
     second later by the same line the clock was already on. */
  const onTime = useCallback(
    (seconds: number) => {
      const current = activeAt(materials, seconds);
      if (current !== null) onSelect(current);
    },
    [materials, onSelect],
  );

  const line = materials.find((m) => m.number === selected) ?? null;
  const dot = line && line.x !== null && line.y !== null ? line : null;

  return (
    <div className={cn("relative", fill && "size-full", className)}>
      <StudioVideo
        video={video}
        poster={pin.imageUrl}
        title={pin.title}
        width={pin.width}
        height={pin.height}
        active={active}
        fill={fill}
        onTime={onTime}
        handleRef={handleRef}
        className={fill ? undefined : "rounded-card"}
      />

      {dot && (
        <span
          aria-hidden
          style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
          className={cn(
            /* Centred on its own coordinate, exactly as the still's dots
               are — the point somebody authored is the point marked. */
            "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2",
            "nums grid size-7 place-items-center rounded-full bg-accent text-micro font-semibold text-on-accent shadow-md",
            /* A ring that expands and fades, once, each time the line
               changes — keyed on the number so React remounts it. The
               dot has to be findable on a moving picture, and a static
               circle on a pan is not. Motion here is decorative and the
               clip itself is already the moving thing; a reader who has
               asked for reduced motion has no video playing under this
               at all, so there is nothing to suppress. */
            "after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-accent/40",
          )}
          key={dot.number}
        >
          {dot.number}
        </span>
      )}

      {/* "Showing now", but only where this component owns the foot of
          the clip. Full-bleed it does not: the room's name, its architect
          and "shop this room" are down there, drawn by `WatchFeed`, which
          renders `NowShowing` itself at the top of that stack. Two
          absolutely positioned overlays both anchored to `bottom` is a
          collision waiting for a long product title. */}
      {!fill && line && (
        <div className="absolute inset-x-3 bottom-16">
          <NowShowing line={line} onSelect={() => onSelect(line.number)} />
        </div>
      )}
    </div>
  );
}

/**
 * The line the clip is on, in words.
 *
 * The part that does the work on a phone. A 28px dot on a clip playing at
 * arm's length is a target nobody hits and a label nobody reads; this
 * says the product, the brand and the price, sits where a thumb already
 * is, and selects the same line the dot does.
 *
 * Exported because the watch feed positions it in its own bottom stack
 * rather than letting it float — see the note above.
 *
 * Absent rather than empty before the first cue: a viewer three seconds
 * into an establishing shot is not being shown a tap, which is the null
 * `activeAt` returns and the reasoning it carries.
 */
export function NowShowing({
  line,
  onSelect,
}: {
  line: RoomMaterial;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-full bg-plate-solid px-3 py-2 text-left shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      <span className="nums grid size-6 shrink-0 place-items-center rounded-full bg-accent text-micro font-semibold text-on-accent">
        {line.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-medium text-ink">
          {line.product.title}
        </span>
        {line.product.brand && (
          <span className="block truncate text-micro text-muted">
            {line.product.brand}
          </span>
        )}
      </span>
      <span className="nums shrink-0 text-caption font-semibold text-ink">
        {formatPrice(line.variant.price)}
        <span className="ml-1 text-micro font-normal text-muted">
          {PRICING_UNIT_LABEL[line.product.pricingUnit]}
        </span>
      </span>
    </button>
  );
}
