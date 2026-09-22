import { ROOMS, type StudioRoom } from "@/lib/types/studio";

/**
 * Studio's filters, as a URL.
 *
 * `/studio?room=kitchen&style=warm&material=wood`, and that string is the
 * whole state. Filters held in React state look identical and produce a
 * result nobody can link, bookmark, or reach with the back button — which
 * on a surface whose entire purpose is "look what I found" is most of the
 * point of having filters at all.
 *
 * AND across the three dimensions, OR within one: a reader who picks
 * Kitchen, then warm *and* minimal, means "a kitchen that is either warm
 * or minimal", not "a kitchen that is both". Narrowing on every added chip
 * empties the grid by the third tap, and an empty grid reads as a broken
 * filter rather than a strict one.
 *
 * Only one `room`, because the room bubbles are a single choice — a
 * kitchen and a bathroom at once is not a thing anyone is looking for.
 *
 * No imports but the room vocabulary, so a client component can build a
 * query string without dragging the data layer into the browser bundle —
 * the same rule `src/lib/types/studio.ts` is split along.
 */
export interface StudioFilters {
  room: StudioRoom | null;
  styles: string[];
  materials: string[];
  q: string | null;
}

export const NO_FILTERS: StudioFilters = {
  room: null,
  styles: [],
  materials: [],
  q: null,
};

/** How many tags one dimension may carry. Past this the URL is being
    used as a database query and the grid is empty anyway. */
const MAX_TAGS = 8;

const ROOM_SET = new Set<string>(ROOMS);

/** Whatever `searchParams` hands over — a string, a repeated key, or
    nothing — as a list. */
function many(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const all = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  for (const raw of all) {
    /* A single repeated key and a comma-separated one both work. People
       edit these URLs by hand and both spellings are reasonable. */
    for (const part of raw.split(",")) {
      const tag = part.trim().toLowerCase();
      if (tag) seen.add(tag);
      if (seen.size >= MAX_TAGS) break;
    }
  }
  return [...seen];
}

/**
 * Reads the filters out of a Next `searchParams` object.
 *
 * Unknown rooms are dropped rather than passed through: `?room=garage`
 * would otherwise reach the data layer as a value `ROOM_TO_DB` has no
 * entry for, and be a crash on a URL anybody can type.
 */
export function readFilters(
  params: Record<string, string | string[] | undefined>,
): StudioFilters {
  const room = typeof params.room === "string" ? params.room.toLowerCase() : null;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  return {
    room: room && ROOM_SET.has(room) ? (room as StudioRoom) : null,
    styles: many(params.style),
    materials: many(params.material),
    q: q || null,
  };
}

/** How many dimensions are narrowing the grid. Not how many chips are lit
    — "two styles" is one filter on one dimension, and saying "3 filters"
    for one room and two styles makes "Clear filters" look like more work
    than it is. */
export function countFilters(filters: StudioFilters): number {
  return (
    (filters.room ? 1 : 0) +
    (filters.styles.length ? 1 : 0) +
    (filters.materials.length ? 1 : 0)
  );
}

/** The query string for a set of filters, without the leading `?`. */
export function toQueryString(filters: StudioFilters, extra?: Record<string, string>): string {
  const search = new URLSearchParams();
  if (filters.room) search.set("room", filters.room);
  for (const style of filters.styles) search.append("style", style);
  for (const material of filters.materials) search.append("material", material);
  if (filters.q) search.set("q", filters.q);
  for (const [key, value] of Object.entries(extra ?? {})) search.set(key, value);
  return search.toString();
}

/** A `/studio` href for these filters. `/studio` when there are none, so
    the cleared state is the canonical URL rather than `/studio?`. */
export function studioHref(filters: StudioFilters, base = "/studio"): string {
  const query = toQueryString(filters);
  return query ? `${base}?${query}` : base;
}

/**
 * The filters with one value toggled.
 *
 * Returned rather than mutated, because every caller is building an
 * `href` for a link — the room bubbles and the chips are links, not
 * buttons, so a filtered grid is reachable with a middle click and
 * readable by a crawler.
 */
export function toggle(
  filters: StudioFilters,
  dimension: "room" | "style" | "material",
  value: string,
): StudioFilters {
  if (dimension === "room") {
    return { ...filters, room: filters.room === value ? null : (value as StudioRoom) };
  }

  const key = dimension === "style" ? "styles" : "materials";
  const current = filters[key];
  const next = current.includes(value)
    ? current.filter((tag) => tag !== value)
    : [...current, value].slice(0, MAX_TAGS);

  return { ...filters, [key]: next };
}
