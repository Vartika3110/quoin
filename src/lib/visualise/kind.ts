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
 *   object   — anything the customer could stand, hang or fit in a room.
 *   null     — services, and the materials that disappear into a wall
 *              (cement, steel, pipe, wire, adhesive).
 */

export type VisualiserKind = "tile" | "paint" | "object";

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
