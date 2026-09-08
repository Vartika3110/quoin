import type { Paise } from "@/lib/types/catalog";

/**
 * Project Studio's vocabulary, without the database.
 *
 * The split this file exists for is the one `src/lib/types/catalog.ts`
 * already makes against `src/lib/data/catalog.ts`: everything a *browser*
 * needs to know about a Studio idea lives here, and everything that
 * touches Prisma lives in `src/lib/data/studio.ts`, which re-exports all
 * of this so server code has one import.
 *
 * Without the split, a client component reaching for `ROOM_LABEL` — which
 * the save sheet, the filter rail and every tile do — drags
 * `@/lib/data/studio` into the bundle, and with it `@/lib/db` and
 * `@/lib/http`, and with *those* `next/headers`. That is not a size
 * problem, it is a build failure, and it is the reason this file has no
 * imports but a type.
 *
 * Money is paise, integer, like everywhere else.
 */

/* ---- Rooms --------------------------------------------------------------- */

export type StudioRoom =
  | "living_room"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "dining"
  | "balcony"
  | "home_office"
  | "entrance"
  | "exterior"
  | "other";

/** Written out rather than derived from an array, so the literal union
    `z.enum` infers *is* `StudioRoom` and a room added to the schema
    without adding it here is a type error at the route, not a value that
    clears validation and throws deeper in `ROOM_TO_DB`. */

/** Display names, here rather than in a component, because the filter
    rail, the Space header and the share card all need the same words. */
export const ROOM_LABEL: Record<StudioRoom, string> = {
  living_room: "Living room",
  kitchen: "Kitchen",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  dining: "Dining",
  balcony: "Balcony",
  home_office: "Home office",
  entrance: "Entrance",
  exterior: "Exterior",
  other: "Other",
};

export const ROOMS: StudioRoom[] = Object.keys(ROOM_LABEL) as StudioRoom[];

/* ---- Visibility ---------------------------------------------------------- */


/* ---- Visibility ---------------------------------------------------------- */

export type Visibility = "private" | "public";


/* ---- Item kinds ---------------------------------------------------------- */

export type ItemKind = "idea" | "product" | "material" | "color" | "note";


/* ---- Colours ------------------------------------------------------------- */

/**
 * One swatch on an idea's palette.
 *
 * The runtime shape is enforced by `SwatchSchema` in
 * `src/lib/data/studio.ts`, which is where a `Json` column is parsed. This
 * is the same thing as a type, so a component can render a palette
 * without importing a validator it has no use for.
 */
export interface Swatch {
  /** `#rrggbb`, lower case. Three-digit hex is expanded on the way in. */
  hex: string;
  name: string;
}

/* ---- The feed ------------------------------------------------------------ */

/**
 * Which feed is being asked for.
 *
 * Here rather than beside `listFeed`, because the tab strip is a client
 * component and this is the only thing about the feed it needs to know.
 * `for_you` is deterministic — the rooms and styles someone has already
 * saved — and the UI says so in words. Nothing in this app looks at a
 * photograph or runs a recommendation model.
 */
export type FeedTab = "for_you" | "trending" | "new" | "saved";

/* ---- Views --------------------------------------------------------------- */

export interface IdeaView {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** Ready to put in `src`. See `imageUrlFor`. */
  imageUrl: string;
  /** The real pixel dimensions. The masonry grid needs the ratio before
      the bytes arrive or every tile reflows as photographs land. */
  width: number;
  height: number;
  blurDataUrl: string | null;
  room: StudioRoom | null;
  styles: string[];
  materials: string[];
  colors: Swatch[];
  visibility: Visibility;
  saveCount: number;
  /** Whether *this viewer* has saved it. Null when signed out — which is
      not `false`: a signed-out visitor has no save state, and rendering a
      hollow heart as though they had one is a lie the moment they sign
      in. */
  saved: boolean | null;
  /** Who uploaded it. Null for the imagery Quoin ships. */
  creator: { name: string } | null;
  createdAt: string;
}

export interface SpaceView {
  id: string;
  slug: string;
  name: string;
  room: StudioRoom;
  description: string;
  /** The cover, or the most recently added idea, or null for a new Space. */
  coverUrl: string | null;
  ideaCount: number;
  productCount: number;
  budgetPaise: Paise;
  /** Derived from the items every time. A budget with its own stored
      "spent" column is a budget that drifts from the lines that made it —
      the rule `summarise` already follows for projects. */
  plannedPaise: Paise;
  visibility: Visibility;
  projectId: string | null;
  updatedAt: string;
}

export interface SpaceItemView {
  id: string;
  kind: ItemKind;
  title: string;
  brand: string;
  surface: string;
  qty: number;
  unit: string;
  unitPricePaise: Paise;
  position: number;
  hex: string | null;
  productSlug: string | null;
  variantId: string | null;
  /** Present only on an `idea` item. */
  idea: IdeaView | null;
}

export interface SpaceDetailView extends SpaceView {
  notes: string;
  items: SpaceItemView[];
}

export interface MoodboardItemView {
  id: string;
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  item: SpaceItemView;
}

export interface MoodboardView {
  id: string;
  spaceId: string;
  title: string;
  canvasWidth: number;
  canvasHeight: number;
  items: MoodboardItemView[];
}

/* ---- Image URLs ---------------------------------------------------------- */

/**
 * Where an idea's photograph is served from.
 *
 * Two cases, and the difference matters because one of them costs a
 * signed-URL round trip:
 *
 *  - `assetPath` — a file this repo ships under `public/`. A plain path,
 *    cached by the CDN forever, and the reason a fresh install has a feed
 *    to render at all rather than an empty grid.
 *  - `fileId` — a customer's upload. The bucket is private and *nothing*
 *    is ever served from a public URL there (see
 *    `src/app/api/v1/uploads/[id]/route.ts`), so this points at
 *    `/studio/image/{id}`, which mints a short-lived signed URL per
 *    request and redirects to it. Baking the signed URL into this string
 *    instead would put a five-minute expiry inside cached feed HTML.
 */
export function imageUrlFor(row: {
  id: string;
  assetPath: string | null;
  fileId: string | null;
}): string {
  return row.assetPath ?? `/studio/image/${row.id}`;
}

/* ---- Money --------------------------------------------------------------- */

/**
 * Everything this customer has planned in a room, as money.
 *
 * Derived on every read, never stored. Colours and notes cost nothing and
 * are excluded rather than counted at zero — summing them in would make
 * "12 items" and "12 priced items" the same number, which they are not.
 */
export function summariseItems(
  items: { kind: ItemKind; qty: number; unitPricePaise: number }[],
): { ideas: number; products: number; materials: number; plannedPaise: Paise } {
  let ideas = 0;
  let products = 0;
  let materials = 0;
  let plannedPaise = 0;

  for (const item of items) {
    if (item.kind === "idea") ideas += 1;
    else if (item.kind === "product") products += 1;
    else if (item.kind === "material") materials += 1;

    if (item.kind === "product" || item.kind === "material") {
      /* Rounded per line, not at the end. A `qty` of 12.5 against a price
         in paise produces a fraction of a paisa, and letting those
         accumulate across twenty lines gives a total that does not equal
         the sum of what is on screen. */
      plannedPaise += Math.round(item.qty * item.unitPricePaise);
    }
  }

  return { ideas, products, materials, plannedPaise };
}

/**
 * This customer's rooms, most recently touched first.
 *
 * The per-space totals come from one query over every item in every one
 * of their spaces, grouped in memory, rather than a count per space. A
 * customer with fifteen rooms is otherwise fifteen round trips to answer
 * a page that shows two numbers on each card.
 */

/* ---- Shop this look ------------------------------------------------------ */

/**
 * A catalogue product matched to something written on an idea.
 *
 * Note what is *not* here: a score. Section 15 of the brief asks for a
 * "92% match" beside each product, and there is nothing in this app that
 * could produce that number honestly — no image model has looked at the
 * photograph, and no embedding has compared anything. A percentage is a
 * claim about a system that does not exist, so these are ranked and left
 * unscored, exactly as `matchParchaLines` returns a match or a null and
 * never a confidence.
 *
 * `term` is carried through so the UI can say where each row came from:
 * "brass" matched this tap, because somebody typed "brass" on this idea.
 */
export interface LookMatch {
  /** The material or style tag this was matched from. */
  term: string;
  slug: string;
  title: string;
  brand: string | null;
  photo?: string;
  image: string;
  pricePaise: Paise;
}

export interface ShopTheLook {
  matches: LookMatch[];
  /** Indicative only — the sum of one unit of each match. Not a quote:
      nobody has said how many taps this kitchen needs. */
  totalPaise: Paise;
  /** Tags that matched nothing. Shown rather than dropped, so the list
      does not quietly get shorter than what the idea actually says. */
  unmatched: string[];
}

