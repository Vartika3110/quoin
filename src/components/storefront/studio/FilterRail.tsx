"use client";

import { Close, Sliders } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { ROOM_LABEL, type StudioRoom } from "@/lib/types/studio";

export interface Filters {
  room: StudioRoom | null;
  styles: string[];
  materials: string[];
}

export const NO_FILTERS: Filters = { room: null, styles: [], materials: [] };

export function countFilters(filters: Filters): number {
  return (filters.room ? 1 : 0) + filters.styles.length + filters.materials.length;
}

/**
 * The filter rail.
 *
 * Every chip here comes from `GET /api/v1/studio/facets`, which reads the
 * tags that are actually on public ideas. Nothing is hard-coded, and that
 * is a decision rather than laziness: a rail offering "Japandi" to a feed
 * with no Japandi in it produces an empty grid behind a chip someone just
 * tapped, which is the fastest way to make a working feature feel broken.
 * A group with no tags does not render at all.
 *
 * Section 23 also asks for budget and colour filters. Neither is here,
 * because neither is a fact this app holds about an idea: a photograph
 * has no price, and the colours on one are a palette a person typed
 * rather than anything measured. Offering the chips and returning
 * everything would be worse than not offering them — see section 41.
 */
export function FilterRail({
  facets,
  filters,
  onChange,
}: {
  facets: {
    rooms: { room: StudioRoom; count: number }[];
    styles: string[];
    materials: string[];
  };
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const active = countFilters(filters);

  function toggleTag(group: "styles" | "materials", tag: string) {
    const current = filters[group];
    onChange({
      ...filters,
      [group]: current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    });
  }

  const hasAnything =
    facets.rooms.length > 0 || facets.styles.length > 0 || facets.materials.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-5 lg:px-0">
        <p className="flex items-center gap-1.5 text-eyebrow uppercase text-faint">
          <Sliders className="size-3.5" />
          Filter
        </p>

        {active > 0 ? (
          <button
            type="button"
            onClick={() => onChange(NO_FILTERS)}
            /* `min-h-11`, not `min-h-9`: this has a text label, so the box
               itself can just be 44px tall rather than borrowing the
               `tap-target` trick built for icon-only corners. */
            className="flex min-h-11 items-center gap-1 rounded-full px-2 text-caption font-medium text-accent transition-colors hover:bg-accent-wash"
          >
            <Close className="size-3.5" />
            Clear {active}
          </button>
        ) : null}
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1 lg:flex-wrap lg:px-0">
        {facets.rooms.map(({ room, count }) => (
          <Chip
            key={room}
            label={ROOM_LABEL[room]}
            detail={count}
            on={filters.room === room}
            onClick={() =>
              onChange({ ...filters, room: filters.room === room ? null : room })
            }
          />
        ))}

        {facets.styles.map((style) => (
          <Chip
            key={`style-${style}`}
            label={style}
            on={filters.styles.includes(style)}
            onClick={() => toggleTag("styles", style)}
          />
        ))}

        {facets.materials.map((material) => (
          <Chip
            key={`material-${material}`}
            label={material}
            on={filters.materials.includes(material)}
            onClick={() => toggleTag("materials", material)}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  detail,
  on,
  onClick,
}: {
  label: string;
  detail?: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        /* `min-h-10` rather than a smaller pill: this row is tapped with a
           thumb far more often than it is clicked. */
        "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-body-sm font-medium capitalize transition-colors",
        on
          ? "border-accent-edge bg-accent-wash text-accent"
          : "border-line-soft bg-surface text-muted hover:bg-hover hover:text-ink",
      )}
    >
      {label}
      {detail != null ? (
        <span className="nums text-caption text-faint">{detail}</span>
      ) : null}
    </button>
  );
}
