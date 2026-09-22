"use client";

import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { Chevron } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { formatPrice, PRICING_UNIT_LABEL } from "@/lib/types/catalog";
import type { IdeaView, RoomMaterial } from "@/lib/types/studio";

/**
 * The room, with its materials dotted on it.
 *
 * The dots and the list under them share one number, and that is the
 * whole interaction: tap dot 3, row 3 lights up; tap row 3, dot 3 does.
 * Two numbering schemes over one set of products would be a puzzle rather
 * than a feature.
 *
 * Coordinates are percentages of the photograph, which is what makes a
 * dot authored once line up at every column width and on a phone's full
 * bleed. A pixel coordinate only lines up at the size it was authored at.
 *
 * The prev/next arrows step through the *dots*, not through pins: a
 * reader who cannot find dot 6 on a busy photograph can arrow to it, and
 * the same keys work for someone who cannot use a pointer at all. Moving
 * between rooms is what "More like this" underneath is for.
 */
export function HotspotPhoto({
  pin,
  materials,
  selected,
  onSelect,
}: {
  pin: IdeaView;
  materials: RoomMaterial[];
  /** The highlighted line's `number`, or null for none. */
  selected: number | null;
  onSelect: (n: number | null) => void;
}) {
  const dots = materials.filter((m) => m.x !== null && m.y !== null);

  function step(by: number) {
    if (dots.length === 0) return;
    const at = selected === null ? -1 : dots.findIndex((d) => d.number === selected);
    const next = (at + by + dots.length) % dots.length;
    onSelect(dots[next].number);
  }

  return (
    <div className="relative">
      <IdeaImage
        src={pin.imageUrl}
        alt={pin.title}
        width={pin.width}
        height={pin.height}
        blurDataUrl={pin.blurDataUrl}
        sizes="(min-width: 1024px) 640px, 100vw"
        preload
        className="rounded-card"
      />

      {dots.map((dot) => {
        const on = selected === dot.number;
        return (
          <button
            key={dot.id}
            type="button"
            onClick={() => onSelect(on ? null : dot.number)}
            aria-pressed={on}
            aria-label={`${dot.number}. ${dot.product.title}`}
            style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
            className={cn(
              /* Centred on its own coordinate rather than hung off the
                 top left of it, so the point a person authored is the
                 point the dot marks. */
              "absolute -translate-x-1/2 -translate-y-1/2",
              "nums grid size-7 place-items-center rounded-full text-micro font-semibold shadow-md transition-[transform,background-color] duration-200 ease-out-quart",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
              on
                ? "scale-110 bg-accent text-on-accent"
                : "bg-plate-solid text-ink hover:scale-110",
            )}
          >
            {dot.number}

            {/* The tooltip is a child of the dot and mounted only while
                it is the selected one. Forty tooltips in the DOM waiting
                to be revealed is forty product names a screen reader has
                to walk past to reach the list. */}
            {on && (
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-lg bg-photo-cta px-2.5 py-2 text-left text-micro leading-snug text-on-photo-cta shadow-lg"
              >
                <span className="block truncate font-semibold">{dot.product.title}</span>
                {dot.product.brand && (
                  <span className="block truncate opacity-80">{dot.product.brand}</span>
                )}
                <span className="nums mt-0.5 block">
                  {formatPrice(dot.variant.price)}{" "}
                  <span className="opacity-80">
                    {PRICING_UNIT_LABEL[dot.product.pricingUnit]}
                  </span>
                </span>
              </span>
            )}
          </button>
        );
      })}

      {dots.length > 1 && (
        <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
          <StepButton label="Previous item" onClick={() => step(-1)} back />
          <StepButton label="Next item" onClick={() => step(1)} />
        </div>
      )}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  back = false,
}: {
  label: string;
  onClick: () => void;
  back?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="tap-target grid size-10 place-items-center rounded-full bg-plate-solid text-ink shadow-md transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Chevron className={cn("size-5", back && "rotate-180")} />
    </button>
  );
}
