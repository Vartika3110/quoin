/**
 * What kind of "see it in your space" a product gets, if any.
 *
 * Decided from the category and the title, because the catalogue carries
 * no `visualiser` flag and inventing one would mean somebody hand-sorting
 * three thousand products. The rules are deliberately conservative: a
 * wrong *yes* puts a cement bag on somebody's lounge floor, and a wrong
 * *no* merely leaves the link off a product where it was never needed.
 *
 *   tile     — something that becomes a floor or wall surface: tiles,
 *              stone, laminates, plywood and veneers.
 *   paint    — a coloured coating. Primers, putty and waterproofing are
 *              not a colour and are not offered paint.
 *   door     — a door leaf itself, fitted into an opening. Door hardware
 *              (locks, hinges, closers, handles) is not a door: that is a
 *              fitting, and is placed like any other object.
 *   object   — anything the customer could stand, hang or fit in a room.
 *   null     — services, and the materials that disappear into a wall
 *              (cement, steel, pipe, wire, adhesive).
 */

export type VisualiserKind = "tile" | "paint" | "door" | "object";

export interface KindInput {
  title: string;
  categorySlug?: string;
  fulfilment: string;
  /** A picture exists, and it is one Quoin serves itself. */
  hasUsablePhoto: boolean;
}

const CONSUMABLE = /\b(cement|steel|tmt|rebar|binder|adhesive|grout|putty|primer|waterproof\w*|sealant|silicone|screw|nail|bolt|nut|pipe|conduit|wire|cable|sand|aggregate|brick|block|gypsum|fevicol|tape)\b/i;
const SURFACE_TITLE = /\b(tile|tiles|vitrified|porcelain|marble|granite|mosaic|slab|flooring|laminate|veneer|plank|wallpaper)\b/i;
const PAINT_TITLE = /\b(emulsion|paint|distemper|enamel|colour|color)\b/i;
const DOOR_TITLE = /\b(door|doors|doorset)\b/i;
const DOOR_FITTING = /\b(handle|handles|lock|locks|latch|hinge|hinges|closer|stopper|stop|bolt|kit|mat|bell|viewer|guard|seal|chain|knob|system|mechanism|fitting|fittings|channel|track|elbow|bend|bracket|sensor|alarm|rail|roller|spring|catcher|holder|db|mcb|dpn|spn|tpn)\b/i;
const FITTING_CATEGORY = /(hardware|lock|electric|plumb|bath|sanitary|cement|steel)/;
const NOT_A_COLOUR = /\b(primer|putty|waterproof\w*|thinner|remover|brush|roller|sealer|undercoat|cleaner)\b/i;

export function visualiserKindFor(p: KindInput): VisualiserKind | null {
  if (p.fulfilment === "bookable") return null;
  if (!p.hasUsablePhoto) return null;

  const slug = p.categorySlug ?? "";
  const title = p.title;

  if (slug === "paints-finishes") {
    return PAINT_TITLE.test(title) && !NOT_A_COLOUR.test(title) ? "paint" : null;
  }
  if (slug === "plywood-laminates") {
    return /\b(laminate|veneer|plank|flooring)\b/i.test(title) ? "tile" : null;
  }
  if (slug === "tiling-adhesives") {
    return SURFACE_TITLE.test(title) && !/\badhesive\b/i.test(title) ? "tile" : null;
  }
  if (slug === "cement-steel") return null;
  if (DOOR_TITLE.test(title) && !DOOR_FITTING.test(title) && !FITTING_CATEGORY.test(slug)) return "door";
  if (CONSUMABLE.test(title) && !SURFACE_TITLE.test(title)) return null;

  return "object";
}

/** The size a title states — "600 x 1200 mm" — or null. Millimetres. */
export function tileSizeFromTitle(title: string): [number, number] | null {
  const m = title.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})\s*(mm|cm)?/i);
  if (!m) return null;
  let a = parseInt(m[1], 10);
  let b = parseInt(m[2], 10);
  if ((m[3] ?? "").toLowerCase() === "cm") {
    a *= 10;
    b *= 10;
  }
  /* A tile is between 100mm and 2400mm a side. Anything else is a
     different measurement that happens to contain an "x". */
  if (a < 100 || b < 100 || a > 2400 || b > 2400) return null;
  return [a, b];
}

/**
 * The size a door's title states, in feet — "7 x 3 ft", "3 ft x 7 ft",
 * "2100 x 900 mm" — as `[width, height]`, or null. Null is a real answer:
 * a listing that does not state a size gets no verdict on whether it fits.
 */
export function doorSizeFromTitle(title: string): [number, number] | null {
  const ft = title.match(/(\d(?:\.\d)?)\s*(?:ft|feet|')?\s*[x×]\s*(\d(?:\.\d)?)\s*(?:ft|feet|')/i);
  if (ft) {
    const a = parseFloat(ft[1]);
    const b = parseFloat(ft[2]);
    return orient(a, b, 1.5, 12);
  }
  const mm = title.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})\s*mm/i);
  if (mm) {
    const a = parseInt(mm[1], 10) / 304.8;
    const b = parseInt(mm[2], 10) / 304.8;
    return orient(Math.round(a * 10) / 10, Math.round(b * 10) / 10, 1.5, 12);
  }
  return null;
}

/** Width is the shorter side. Anything outside a plausible door is not one. */
function orient(a: number, b: number, lo: number, hi: number): [number, number] | null {
  const w = Math.min(a, b);
  const h = Math.max(a, b);
  if (w < lo || h > hi || h < 5) return null;
  return [w, h];
}

/** A product photograph the visualiser may load: Quoin's own, same-origin
    or in the public catalogue bucket. Third-party source photography is
    quarantined and is neither copied nor drawn onto a canvas. */
export function isOwnPhoto(photo: string | undefined | null): photo is string {
  return Boolean(photo && (photo.startsWith("/") || photo.includes("/storage/v1/object/public/")));
}

/** A URL a canvas can draw without being tainted. Local paths are already
    same-origin; the bucket's images go through the image optimiser, which
    serves them from this origin. */
export function sameOriginSrc(photo: string): string {
  if (photo.startsWith("/")) return photo;
  return `/_next/image?url=${encodeURIComponent(photo)}&w=1080&q=75`;
}
