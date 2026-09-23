import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type {
  StudioRoom as DbRoom,
  StudioVisibility as DbVisibility,
  StudioItemKind as DbItemKind,
  StudioIdeaKind as DbIdeaKind,
} from "@prisma/client";
import { db } from "@/lib/db";
import { matchParchaLines } from "@/lib/data/search";
import { listProductsBySlugs } from "@/lib/data/catalog";
import { ApiError } from "@/lib/http";
import type { Paise } from "@/lib/types/catalog";
import type {
  FeedTab,
  LookMatch,
  ShopTheLook,
  ItemKind,
  IdeaKind,
  DesignerView,
  RoomMaterial,
  SpacePinView,
  Swatch,
  StudioRoom,
  Visibility,
  IdeaView,
  SpaceView,
  SpaceItemView,
  SpaceDetailView,
  MoodboardView,
} from "@/lib/types/studio";
import { imageUrlFor, summariseItems } from "@/lib/types/studio";

/* Re-exported so every server module has one Studio import, and so the
   tests and routes that already reach for these do not have to know
   which half of the split they live in. See `src/lib/types/studio.ts`
   for why the split exists at all. */
export * from "@/lib/types/studio";

/**
 * Project Studio — the server side.
 *
 * `prisma/schema.prisma` carries the reasoning for the shape of the
 * tables; this module owns three things the schema cannot state:
 *
 *  1. **The wire vocabulary.** Rooms, visibility and item kinds are
 *     lower-snake on the wire and SCREAMING_SNAKE in Postgres, exactly as
 *     the catalogue, consultations and projects already are. The `Record`s
 *     below are the only place that mapping is written down. Nothing else
 *     — including the client store — may re-derive it with
 *     `toUpperCase()`, which silently accepts a value neither side
 *     defined.
 *  2. **Where an image lives.** An idea is either a customer's upload in
 *     the private bucket or a file this repo ships under `public/`.
 *     `imageUrlFor` is the one function that knows which, so every caller
 *     gets a URL that works without knowing that a signed-URL round trip
 *     is involved for one of them and not the other.
 *  3. **Visibility, in the `where` clause.** A private idea and an idea
 *     that does not exist return the same thing to someone who does not
 *     own it — the discipline `getOrderForUser` established, applied here
 *     because Studio has public URLs and therefore has crawlers on them.
 *
 * Money is paise, integer, like everywhere else in this app.
 */

/* ---- Rooms --------------------------------------------------------------- */

export const RoomSchema = z.enum([
  "living_room",
  "kitchen",
  "bedroom",
  "bathroom",
  "dining",
  "balcony",
  "home_office",
  "entrance",
  "exterior",
  "other",
]);

export const ROOM_TO_DB: Record<StudioRoom, DbRoom> = {
  living_room: "LIVING_ROOM",
  kitchen: "KITCHEN",
  bedroom: "BEDROOM",
  bathroom: "BATHROOM",
  dining: "DINING",
  balcony: "BALCONY",
  home_office: "HOME_OFFICE",
  entrance: "ENTRANCE",
  exterior: "EXTERIOR",
  other: "OTHER",
};

export const ROOM_FROM_DB: Record<DbRoom, StudioRoom> = {
  LIVING_ROOM: "living_room",
  KITCHEN: "kitchen",
  BEDROOM: "bedroom",
  BATHROOM: "bathroom",
  DINING: "dining",
  BALCONY: "balcony",
  HOME_OFFICE: "home_office",
  ENTRANCE: "entrance",
  EXTERIOR: "exterior",
  OTHER: "other",
};

export const IdeaKindSchema = z.enum(["space", "product"]);

export const IDEA_KIND_TO_DB: Record<IdeaKind, DbIdeaKind> = {
  space: "SPACE",
  product: "PRODUCT",
};

export const IDEA_KIND_FROM_DB: Record<DbIdeaKind, IdeaKind> = {
  SPACE: "space",
  PRODUCT: "product",
};

export const VisibilitySchema = z.enum(["private", "public"]);

export const VISIBILITY_TO_DB: Record<Visibility, DbVisibility> = {
  private: "PRIVATE",
  public: "PUBLIC",
};

export const VISIBILITY_FROM_DB: Record<DbVisibility, Visibility> = {
  PRIVATE: "private",
  PUBLIC: "public",
};

/* ---- Item kinds ---------------------------------------------------------- */

export const ItemKindSchema = z.enum(["idea", "product", "material", "color", "note"]);

export const ITEM_KIND_TO_DB: Record<ItemKind, DbItemKind> = {
  idea: "IDEA",
  product: "PRODUCT",
  material: "MATERIAL",
  color: "COLOR",
  note: "NOTE",
};

export const ITEM_KIND_FROM_DB: Record<DbItemKind, ItemKind> = {
  IDEA: "idea",
  PRODUCT: "product",
  MATERIAL: "material",
  COLOR: "color",
  NOTE: "note",
};

/* ---- Colours ------------------------------------------------------------- */

/**
 * One swatch on an idea's palette.
 *
 * `StudioIdea.colors` is `Json`, so this is the shape that column is
 * *promised* to hold and the schema that enforces it on the way in.
 * Nothing reads it without parsing — a Json column is only as trustworthy
 * as the last thing that wrote to it, and rows written before a shape
 * changed are exactly the ones that crash a page months later.
 */
export const SwatchSchema = z.object({
  /** `#rrggbb`, lower case. Three-digit hex is expanded on the way in so
      the palette renders identically wherever it is drawn. */
  hex: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/, "Use a hex colour like #d9c9b4")
    .transform(expandHex),
  name: z.string().trim().min(1).max(40),
});


function expandHex(value: string): string {
  if (value.length !== 4) return value;
  const [, r, g, b] = value;
  return `#${r}${r}${g}${g}${b}${b}`;
}

/** A palette that never throws. An idea whose `colors` predates a shape
    change renders with no palette rather than taking the page down. */
function readSwatches(value: Prisma.JsonValue | null): Swatch[] {
  const parsed = z.array(SwatchSchema).max(12).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/* ---- Views --------------------------------------------------------------- */

/* ---- Image URLs ---------------------------------------------------------- */

/* ---- Slugs --------------------------------------------------------------- */

/** No O, 0, I, 1 — a slug ends up read off a screen and typed. */
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * A URL-safe slug with a short random suffix.
 *
 * The suffix is not decoration: two people uploading "Warm minimal
 * kitchen" must both get a working URL, and the alternative — retrying on
 * a unique-constraint violation — either renames the second one to
 * `-2` (which tells everybody they were second) or loops. `randomInt`
 * rather than `Math.random` for the same reason `generateReference` uses
 * it: a public URL that is guessable from another one issued the same
 * second is a URL someone can enumerate.
 */
export function slugify(title: string, maxWords = 8): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join("-")
    .slice(0, 60);

  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];

  return base ? `${base}-${suffix}` : suffix;
}

/** Tags are stored lower-cased so "Modern" and "modern" are one filter
    rather than two entries in the same rail. */
function normaliseTags(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (tag) seen.add(tag);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

/* ---- Row → view ---------------------------------------------------------- */

const IDEA_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  assetPath: true,
  fileId: true,
  width: true,
  height: true,
  blurDataUrl: true,
  room: true,
  styles: true,
  materials: true,
  colors: true,
  visibility: true,
  saveCount: true,
  createdAt: true,
  kind: true,
  location: true,
  user: { select: { name: true } },
  designer: { select: { slug: true, name: true, headline: true } },
  _count: { select: { hotspots: true } },
} satisfies Prisma.StudioIdeaSelect;

type IdeaRow = Prisma.StudioIdeaGetPayload<{ select: typeof IDEA_SELECT }>;

function toIdeaView(row: IdeaRow, savedIds: Set<string> | null): IdeaView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    kind: IDEA_KIND_FROM_DB[row.kind],
    location: row.location,
    designer: row.designer,
    imageUrl: imageUrlFor(row),
    width: row.width,
    height: row.height,
    blurDataUrl: row.blurDataUrl,
    room: row.room ? ROOM_FROM_DB[row.room] : null,
    styles: row.styles,
    materials: row.materials,
    colors: readSwatches(row.colors),
    visibility: VISIBILITY_FROM_DB[row.visibility],
    saveCount: row.saveCount,
    materialCount: row._count.hotspots,
    saved: savedIds ? savedIds.has(row.id) : null,
    /* A creator with no name on their account is shown as no creator
       rather than as an empty byline — `name` is optional on `User`. */
    creator: row.user?.name ? { name: row.user.name } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Which of these ideas the viewer has already saved.
 *
 * One query for the whole page, not one per card. Null for a signed-out
 * viewer, which flows through to `IdeaView.saved` as null — see the
 * comment on that field for why that is not `false`.
 */
async function savedIdSet(
  viewerId: string | null,
  ideaIds: string[],
): Promise<Set<string> | null> {
  if (!viewerId) return null;
  if (ideaIds.length === 0) return new Set();

  const rows = await db.studioSave.findMany({
    where: { userId: viewerId, ideaId: { in: ideaIds } },
    select: { ideaId: true },
  });
  return new Set(rows.map((r) => r.ideaId));
}

/* ---- The feed ------------------------------------------------------------ */

export const FeedTabSchema = z.enum(["for_you", "trending", "new", "saved"]);

export interface FeedQuery {
  tab?: FeedTab;
  room?: StudioRoom;
  styles?: string[];
  materials?: string[];
  /** Free text, matched against title, description and tags. */
  q?: string;
  /** Opaque cursor — the id of the last row of the previous page. */
  cursor?: string;
  limit?: number;
}

export interface FeedPage {
  ideas: IdeaView[];
  /** Null when there is no next page. Pass back as `cursor`. */
  nextCursor: string | null;
}

/** Forty tiles is roughly two screens of a five-column grid, which is the
    point at which the next page can be fetched before anyone reaches the
    bottom. */
export const FEED_PAGE_SIZE = 40;
const FEED_PAGE_MAX = 60;

/**
 * The discovery feed.
 *
 * Public ideas only — plus, on the `saved` tab, whatever this viewer has
 * saved, which may include their own private uploads. That exception is
 * the *only* place a private row leaves this module for the feed, and it
 * is scoped by `userId` in the `where` clause rather than filtered
 * afterwards.
 *
 * Keyset pagination on `(sort key, id)`, not `skip`/`take`. An offset
 * into a feed that is being written to shows the same tile twice and
 * skips another; Postgres also has to walk every skipped row, so page
 * twenty costs twenty pages of work.
 */
export async function listFeed(
  viewerId: string | null,
  query: FeedQuery = {},
): Promise<FeedPage> {
  const tab = query.tab ?? "new";
  const limit = Math.min(Math.max(query.limit ?? FEED_PAGE_SIZE, 1), FEED_PAGE_MAX);

  if (tab === "saved") return listSavedFeed(viewerId, query, limit);

  const where: Prisma.StudioIdeaWhereInput = {
    /* Finished rooms, and nothing else. The catalogue's department
       photography lives in the same table — a hard hat, a pallet of
       cement, a tray of door handles — and it is genuinely useful on a
       product page and useless here. Someone opening Studio is asking
       "what could my kitchen look like", and answering with safety
       equipment is answering a different question.

       In the `where` clause rather than filtered afterwards, so the
       keyset pagination counts the rows it actually returns. A filter
       applied to the page would give short pages, or empty ones, with a
       cursor that still says there is more. */
    kind: "SPACE",
    visibility: "PUBLIC",
    ...filterClause(query),
  };

  /* `for_you` is deterministic and says so in the UI: the rooms and
     styles this viewer has already saved, newest first, falling back to
     the plain new feed for someone who has saved nothing. There is no
     recommendation engine behind this app and this must not pretend
     otherwise — see section 41 of the brief and the comment on
     `matchParchaLines`. */
  if (tab === "for_you" && viewerId) {
    const affinity = await affinityFor(viewerId);
    if (affinity) {
      where.OR = [
        ...(affinity.rooms.length ? [{ room: { in: affinity.rooms } }] : []),
        ...(affinity.styles.length ? [{ styles: { hasSome: affinity.styles } }] : []),
      ];
      /* An empty OR array matches nothing at all in Prisma, which would
         turn "we have not learnt anything about you yet" into an empty
         page rather than the general feed. */
      if (where.OR.length === 0) delete where.OR;
    }
  }

  const orderBy: Prisma.StudioIdeaOrderByWithRelationInput[] =
    tab === "trending"
      ? [{ saveCount: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

  const rows = await db.studioIdea.findMany({
    where,
    orderBy,
    select: IDEA_SELECT,
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  return page(rows, limit, viewerId);
}

/**
 * How many rooms the current filters found.
 *
 * A real `count`, not `ideas.length`: the grid holds one page of forty
 * and the line above it says "63 rooms match", which is the number that
 * tells somebody whether their filter was too narrow. Counting the page
 * would say "40" forever and be wrong in the one direction that matters.
 *
 * Deliberately not part of `listFeed`. Most callers of the feed — the
 * infinite-scroll append, the API route — do not want a second query per
 * page, and a count that rides along with every page is exactly that.
 */
export async function countFeed(query: FeedQuery = {}): Promise<number> {
  return db.studioIdea.count({
    where: {
      kind: "SPACE",
      visibility: "PUBLIC",
      ...filterClause(query),
    },
  });
}

/** The `saved` tab. Signed out, this is empty rather than an error —
    nobody signed out has saved anything, which is a normal state. */
async function listSavedFeed(
  viewerId: string | null,
  query: FeedQuery,
  limit: number,
): Promise<FeedPage> {
  if (!viewerId) return { ideas: [], nextCursor: null };

  const rows = await db.studioIdea.findMany({
    where: {
      saves: { some: { userId: viewerId } },
      ...filterClause(query),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: IDEA_SELECT,
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  return page(rows, limit, viewerId);
}

async function page(
  rows: IdeaRow[],
  limit: number,
  viewerId: string | null,
): Promise<FeedPage> {
  /* One row over the limit was fetched purely to answer "is there
     another page", which is cheaper and more honest than a `count` over
     the same filter. */
  const hasMore = rows.length > limit;
  const window = hasMore ? rows.slice(0, limit) : rows;

  const saved = await savedIdSet(viewerId, window.map((r) => r.id));

  return {
    ideas: window.map((row) => toIdeaView(row, saved)),
    nextCursor: hasMore ? (window.at(-1)?.id ?? null) : null,
  };
}

/** Room, style, material and free-text filters, shared by every feed. */
function filterClause(query: FeedQuery): Prisma.StudioIdeaWhereInput {
  const where: Prisma.StudioIdeaWhereInput = {};

  if (query.room) where.room = ROOM_TO_DB[query.room];

  const styles = normaliseTags(query.styles ?? [], 8);
  if (styles.length) where.styles = { hasSome: styles };

  const materials = normaliseTags(query.materials ?? [], 8);
  if (materials.length) where.materials = { hasSome: materials };

  const q = query.q?.trim();
  if (q) {
    /* `mode: "insensitive"` on the text columns and an exact match on the
       tag arrays: Postgres cannot do a case-insensitive `hasSome`, which
       is precisely why tags are lower-cased on write. */
    const term = q.toLowerCase();
    where.AND = [
      {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { styles: { has: term } },
          { materials: { has: term } },
        ],
      },
    ];
  }

  return where;
}

/**
 * What this viewer has shown an interest in, read off their own saves.
 *
 * Deterministic and explainable — "because you saved kitchens" is a true
 * sentence about this query. Capped at the last 60 saves so someone with
 * a long history gets their recent taste rather than their whole one.
 */
async function affinityFor(
  userId: string,
): Promise<{ rooms: DbRoom[]; styles: string[] } | null> {
  const saves = await db.studioSave.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { idea: { select: { room: true, styles: true } } },
  });
  if (saves.length === 0) return null;

  const rooms = new Set<DbRoom>();
  const styles = new Set<string>();
  for (const { idea } of saves) {
    if (idea.room) rooms.add(idea.room);
    for (const style of idea.styles) styles.add(style);
  }

  return { rooms: [...rooms], styles: [...styles].slice(0, 12) };
}

/**
 * The tags actually present on public ideas, for the filter rail.
 *
 * Read from the data rather than hard-coded, so the rail never offers
 * "Japandi" to a catalogue that has no Japandi in it — an empty result
 * set behind a filter chip is the fastest way to make a feed feel broken.
 */
export interface RoomFacet {
  room: StudioRoom;
  count: number;
  /** A real room from behind this filter, for the bubble — never a stock
      photograph of a kitchen standing in for the kitchens Quoin actually
      has. Null while no pin behind this filter has been photographed,
      which is currently all of them (see `imageUrlFor`); the bubble
      draws its ground and the label under it does the work. */
  imageUrl: string | null;
  blurDataUrl: string | null;
}

export async function listFacets(): Promise<{
  rooms: RoomFacet[];
  styles: string[];
  materials: string[];
}> {
  const [byRoom, tagRows] = await Promise.all([
    db.studioIdea.groupBy({
      by: ["room"],
      /* The same population the feed draws from. A rail that counts
         product shots offers "Kitchen · 9" and then shows three rooms,
         which is worse than offering nothing. */
      where: { kind: "SPACE", visibility: "PUBLIC", room: { not: null } },
      _count: { _all: true },
    }),
    db.studioIdea.findMany({
      where: { kind: "SPACE", visibility: "PUBLIC" },
      /* The image columns ride along so the room bubbles can show a real
         room from behind each filter rather than a stock photograph of
         someone else's kitchen. Ordered by saves, so the bubble is the
         best-liked room in that filter and not whichever one was
         uploaded most recently. */
      select: {
        id: true,
        room: true,
        assetPath: true,
        fileId: true,
        blurDataUrl: true,
        styles: true,
        materials: true,
      },
      /* A sample, not the table. The rail shows a dozen chips; reading
         every row to build it would grow linearly with the feed forever. */
      take: 500,
      orderBy: [{ saveCount: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const styles = new Map<string, number>();
  const materials = new Map<string, number>();
  /* First row wins, and the rows arrive most-saved first. */
  const cover = new Map<
    DbRoom,
    { imageUrl: string | null; blurDataUrl: string | null }
  >();

  for (const row of tagRows) {
    for (const s of row.styles) styles.set(s, (styles.get(s) ?? 0) + 1);
    for (const m of row.materials) materials.set(m, (materials.get(m) ?? 0) + 1);
    if (row.room && !cover.has(row.room)) {
      cover.set(row.room, {
        imageUrl: imageUrlFor(row),
        blurDataUrl: row.blurDataUrl,
      });
    }
  }

  const top = (counts: Map<string, number>, n: number) =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([tag]) => tag);

  return {
    rooms: byRoom
      .filter((r): r is typeof r & { room: DbRoom } => r.room !== null)
      .map((r) => ({
        room: ROOM_FROM_DB[r.room],
        count: r._count._all,
        imageUrl: cover.get(r.room)?.imageUrl ?? null,
        blurDataUrl: cover.get(r.room)?.blurDataUrl ?? null,
      }))
      .sort((a, b) => b.count - a.count),
    styles: top(styles, 14),
    materials: top(materials, 14),
  };
}

/* ---- One idea ------------------------------------------------------------ */

/**
 * One idea by slug.
 *
 * Visibility is in the `where` clause, not a check afterwards: a private
 * idea belonging to someone else returns null exactly as a slug that was
 * never issued does, so a crawler cannot tell the two apart. This page
 * has a public URL, which is what makes that distinction matter here and
 * not on, say, a project dashboard.
 */
export async function getIdeaBySlug(
  slug: string,
  viewerId: string | null,
): Promise<IdeaView | null> {
  const row = await db.studioIdea.findFirst({
    where: {
      slug,
      OR: [{ visibility: "PUBLIC" }, ...(viewerId ? [{ userId: viewerId }] : [])],
    },
    select: IDEA_SELECT,
  });
  if (!row) return null;

  const saved = await savedIdSet(viewerId, [row.id]);
  return toIdeaView(row, saved);
}

/**
 * Where an idea's bytes actually are, for `/studio/image/{id}`.
 *
 * Returns the storage key rather than the file id, joined in the same
 * query, because that route needs it on every single tile of a
 * forty-image grid and a second round trip per image is the whole page's
 * latency budget spent on bookkeeping.
 *
 * `status: "STORED"` is part of the join: a `PENDING` row is a signed
 * upload URL nobody used, which is ordinary, and it has no bytes to sign.
 */
export async function getIdeaImageSource(
  id: string,
  viewerId: string | null,
): Promise<{ assetPath: string | null; storageKey: string | null } | null> {
  const row = await db.studioIdea.findFirst({
    where: {
      id,
      OR: [{ visibility: "PUBLIC" }, ...(viewerId ? [{ userId: viewerId }] : [])],
    },
    select: {
      assetPath: true,
      file: { select: { storageKey: true, status: true } },
    },
  });
  if (!row) return null;

  return {
    assetPath: row.assetPath,
    storageKey: row.file?.status === "STORED" ? row.file.storageKey : null,
  };
}

/** More like this: same room first, then shared styles. Ranked, and
    deliberately not scored — a percentage implies a model that does not
    exist behind this app. */
export async function listRelatedIdeas(
  idea: IdeaView,
  viewerId: string | null,
  limit = 12,
): Promise<IdeaView[]> {
  const rows = await db.studioIdea.findMany({
    where: {
      kind: "SPACE",
      visibility: "PUBLIC",
      id: { not: idea.id },
      OR: [
        ...(idea.room ? [{ room: ROOM_TO_DB[idea.room] }] : []),
        ...(idea.styles.length ? [{ styles: { hasSome: idea.styles } }] : []),
        ...(idea.materials.length ? [{ materials: { hasSome: idea.materials } }] : []),
      ],
    },
    orderBy: [{ saveCount: "desc" }, { createdAt: "desc" }],
    select: IDEA_SELECT,
    take: limit,
  });
  if (rows.length === 0) return [];

  const saved = await savedIdSet(viewerId, rows.map((r) => r.id));
  return rows.map((row) => toIdeaView(row, saved));
}

/* ---- What a room is made of ---------------------------------------------- */

/**
 * A space pin with its materials list, priced from the catalogue now.
 *
 * Three queries and never more, whatever the room holds: the pin, its
 * hotspots, and one `findMany` over every product slug those hotspots
 * name. A room with eighteen lines must not be eighteen round trips.
 *
 * **Prices are read, not stored.** `StudioHotspot` carries a slug and a
 * quantity and no money at all, and that is the point: a kitchen
 * photographed in March and shown in September has to be priced in
 * September or the total under it is a quote nobody agreed to. The same
 * rule the cart follows when it re-resolves a line before anything is
 * charged.
 *
 * A slug that no longer resolves is dropped rather than rendered as a
 * blank row. The catalogue is re-imported wholesale and SKUs retire; a
 * list that quietly gets shorter is better than one with a hole in it
 * linking nowhere — and it is what `matchParchaLines` already does with a
 * line it cannot place.
 */
export async function getSpacePin(
  idOrSlug: string,
  viewerId: string | null,
): Promise<SpacePinView | null> {
  const row = await db.studioIdea.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      AND: [
        { OR: [{ visibility: "PUBLIC" }, ...(viewerId ? [{ userId: viewerId }] : [])] },
      ],
    },
    select: IDEA_SELECT,
  });
  if (!row) return null;

  const [saved, materials] = await Promise.all([
    savedIdSet(viewerId, [row.id]),
    listRoomMaterials(row.id),
  ]);

  return {
    pin: toIdeaView(row, saved),
    materials,
    totalPaise: materials.reduce((sum, line) => sum + line.linePaise, 0),
  };
}

/**
 * The priced lines for one room.
 *
 * Numbered so the dots on the photograph run 1..n with no gaps: lines
 * that carry a coordinate are numbered first, in their stored order, and
 * the lines with no dot — the cement under the floor, the adhesive
 * behind the tile — follow. A list numbered in storage order instead
 * would put dot 4 between dots 1 and 2 on the photograph as soon as one
 * line in the middle had no coordinate.
 */
export async function listRoomMaterials(ideaId: string): Promise<RoomMaterial[]> {
  const hotspots = await db.studioHotspot.findMany({
    where: { ideaId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  if (hotspots.length === 0) return [];

  const products = await listProductsBySlugs(hotspots.map((h) => h.productSlug));
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  /* Pinned lines first, then the rest — see the note above on numbering. */
  const ordered = [
    ...hotspots.filter((h) => h.x !== null && h.y !== null),
    ...hotspots.filter((h) => h.x === null || h.y === null),
  ];

  const lines: RoomMaterial[] = [];
  for (const hotspot of ordered) {
    const product = bySlug.get(hotspot.productSlug);
    if (!product) continue;

    /* The variant the room actually used, or the cheapest active one. A
       room that named a variant which has since been retired falls back
       rather than dropping the line: it is still the right product, and
       still a real price. */
    const variant =
      product.variants.find((v) => v.id === hotspot.variantId) ?? product.variants[0];
    if (!variant) continue;

    lines.push({
      id: hotspot.id,
      number: lines.length + 1,
      x: hotspot.x,
      y: hotspot.y,
      product,
      variant,
      qty: hotspot.qty,
      unit: hotspot.unit,
      /* Rounded per line, not at the end. `summariseItems` carries the
         reasoning: a fraction of a paisa per line, accumulated over
         eighteen of them, gives a total that does not equal the sum of
         what is on screen. */
      linePaise: Math.round(hotspot.qty * variant.price),
    });
  }

  return lines;
}

/**
 * The best-saved rooms, for the home page.
 *
 * Used twice there — the hero's photograph and the "From the Studio" row
 * — and it is one query for both, which is also what stops the hero
 * picture being a room that does not appear in the row beneath it.
 *
 * Ordered by saves, then recency. `saveCount` is denormalised on the row
 * (see the schema) precisely so a popularity sort is an index scan rather
 * than a count per idea.
 */
export async function listTopRooms(limit = 6): Promise<IdeaView[]> {
  const rows = await db.studioIdea.findMany({
    where: { kind: "SPACE", visibility: "PUBLIC" },
    orderBy: [{ saveCount: "desc" }, { createdAt: "desc" }],
    select: IDEA_SELECT,
    take: limit,
  });
  return rows.map((row) => toIdeaView(row, null));
}

/* ---- Designers ----------------------------------------------------------- */

/**
 * The designers with public rooms.
 *
 * Empty until a real person is entered into `studio_designers`, and that
 * is the correct state rather than a gap to fill with plausible names.
 * `src/lib/data/services.ts` sets the rule and gives the reason: there is
 * no vendor roster behind this app, and a page of invented professionals
 * beside a real catalogue is the single most damaging thing a
 * marketplace can ship. The Designers tab says so in words.
 */
export async function listDesigners(): Promise<DesignerView[]> {
  const rows = await db.studioDesigner.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { ideas: { where: { kind: "SPACE", visibility: "PUBLIC" } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    headline: row.headline,
    bio: row.bio,
    avatarPath: row.avatarPath,
    serviceSlug: row.serviceSlug,
    roomCount: row._count.ideas,
  }));
}

export async function getDesignerBySlug(
  slug: string,
): Promise<{ designer: DesignerView; rooms: IdeaView[] } | null> {
  const row = await db.studioDesigner.findUnique({
    where: { slug },
    include: {
      _count: { select: { ideas: { where: { kind: "SPACE", visibility: "PUBLIC" } } } },
    },
  });
  if (!row) return null;

  const rooms = await db.studioIdea.findMany({
    where: { designerId: row.id, kind: "SPACE", visibility: "PUBLIC" },
    orderBy: { createdAt: "desc" },
    select: IDEA_SELECT,
    take: 60,
  });

  return {
    designer: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      headline: row.headline,
      bio: row.bio,
      avatarPath: row.avatarPath,
      serviceSlug: row.serviceSlug,
      roomCount: row._count.ideas,
    },
    rooms: rooms.map((r) => toIdeaView(r, null)),
  };
}

export interface NewIdeaInput {
  title: string;
  description?: string;
  /** A confirmed `StoredFile` this user owns, or a path under `public/`. */
  fileId?: string;
  assetPath?: string;
  width: number;
  height: number;
  blurDataUrl?: string;
  room?: StudioRoom;
  styles?: string[];
  materials?: string[];
  colors?: Swatch[];
  visibility?: Visibility;
}

/**
 * A refusal from this module, already speaking HTTP.
 *
 * Extends `ApiError` rather than defining a private vocabulary that every
 * route then has to translate, because that translation is a `switch`
 * repeated in eight files and the eighth one is where a `conflict`
 * quietly becomes a 500. `handler()` already turns an `ApiError` into the
 * right response, so a route calls into here and does nothing else.
 *
 * `ApiError` comes from `src/lib/http.ts`, which is server-only — as is
 * this module, which imports Prisma. Nothing in the browser imports
 * either as a value.
 */
export class StudioError extends ApiError {
  constructor(reason: "not_found" | "conflict" | "bad_request", message: string) {
    super(reason, message);
    this.name = "StudioError";
  }
}

/**
 * Records an uploaded photograph as an idea.
 *
 * The `fileId`/`assetPath` exclusivity the schema cannot express is
 * enforced here, at the one place rows are created. So is ownership of
 * the file: a `StoredFile` id is a cuid someone could guess at, and
 * without this check an attacker could attach another customer's parcha
 * photograph to a public idea.
 */
export async function createIdea(
  userId: string | null,
  input: NewIdeaInput,
): Promise<IdeaView> {
  const hasFile = Boolean(input.fileId);
  const hasAsset = Boolean(input.assetPath);
  if (hasFile === hasAsset) {
    throw new StudioError(
      "bad_request",
      "An idea needs exactly one image source",
    );
  }

  if (input.fileId) {
    const file = await db.storedFile.findFirst({
      where: { id: input.fileId, userId, status: "STORED" },
      select: { id: true },
    });
    if (!file) {
      throw new StudioError("not_found", "That upload is not ready yet");
    }
    /* One idea per file. Without this, re-posting the same upload makes
       duplicate tiles of one photograph, and deleting one of them leaves
       the other pointing at bytes that are now unreferenced. */
    const existing = await db.studioIdea.findFirst({
      where: { fileId: input.fileId },
      select: { id: true },
    });
    if (existing) {
      throw new StudioError("conflict", "That image is already in your Studio");
    }
  }

  const row = await db.studioIdea.create({
    data: {
      slug: slugify(input.title),
      userId,
      fileId: input.fileId ?? null,
      assetPath: input.assetPath ?? null,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      width: input.width,
      height: input.height,
      blurDataUrl: input.blurDataUrl ?? null,
      room: input.room ? ROOM_TO_DB[input.room] : null,
      styles: normaliseTags(input.styles ?? [], 12),
      materials: normaliseTags(input.materials ?? [], 12),
      colors: (input.colors ?? []) as unknown as Prisma.InputJsonValue,
      visibility: VISIBILITY_TO_DB[input.visibility ?? "private"],
    },
    select: IDEA_SELECT,
  });

  return toIdeaView(row, new Set());
}

/** Only the owner's own idea, and that is the `where` clause rather than
    a check afterwards, for the reason given on `getIdeaBySlug`. */
export async function deleteIdea(userId: string, id: string): Promise<boolean> {
  const { count } = await db.studioIdea.deleteMany({ where: { id, userId } });
  return count > 0;
}

/* ---- Saving -------------------------------------------------------------- */

/**
 * Saves an idea, and optionally files it into Spaces at the same time.
 *
 * One transaction, because a save that succeeds while the filing fails
 * leaves the heart filled and the Kitchen empty, which is the version of
 * this bug nobody reports and everybody notices.
 *
 * Idempotent throughout: `StudioSave` has a unique constraint on
 * `(userId, ideaId)` and the space items are `createMany` with
 * `skipDuplicates`, so tapping Save twice on a slow connection is one
 * save and not an error.
 */
export async function saveIdea(
  userId: string,
  ideaId: string,
  spaceIds: string[] = [],
): Promise<{ saved: true; spaces: number }> {
  /* Public, or their own. A private idea belonging to someone else is
     not saveable and is not distinguishable from one that never existed. */
  const idea = await db.studioIdea.findFirst({
    where: { id: ideaId, OR: [{ visibility: "PUBLIC" }, { userId }] },
    select: { id: true },
  });
  if (!idea) throw new StudioError("not_found", "No such idea");

  /* Scoped to this user, so a guessed space id cannot file an idea into
     someone else's room. The count that comes back is what actually
     happened, not what was asked for. */
  const owned = spaceIds.length
    ? await db.studioSpace.findMany({
        where: { id: { in: spaceIds }, userId },
        select: { id: true },
      })
    : [];

  await db.$transaction(async (tx) => {
    const created = await tx.studioSave.createMany({
      data: [{ userId, ideaId }],
      skipDuplicates: true,
    });
    /* Only when the save is new, or saving the same idea twice inflates
       the count the trending feed sorts by. */
    if (created.count > 0) {
      await tx.studioIdea.update({
        where: { id: ideaId },
        data: { saveCount: { increment: 1 } },
      });
    }

    if (owned.length) {
      await tx.studioSpaceItem.createMany({
        data: owned.map((s) => ({ spaceId: s.id, kind: "IDEA" as const, ideaId })),
        skipDuplicates: true,
      });
      /* A Space with no cover takes the first idea filed into it. Chosen
         covers are left alone — `coverIdeaId: null` in the filter is what
         makes that true. */
      await tx.studioSpace.updateMany({
        where: { id: { in: owned.map((s) => s.id) }, coverIdeaId: null },
        data: { coverIdeaId: ideaId },
      });
    }
  });

  return { saved: true, spaces: owned.length };
}

/**
 * Unsaves an idea.
 *
 * Deliberately does *not* remove it from the Spaces it was filed into.
 * Unsaving is undoing a tap on a heart; a room someone has been building
 * for a month is not collateral for that. Removing it from a Space is its
 * own action, in that Space.
 */
export async function unsaveIdea(userId: string, ideaId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.studioSave.deleteMany({ where: { userId, ideaId } });
    if (count === 0) return false;

    /* `Math.max` in SQL, not in JS: two concurrent unsaves would each
       read the same count and both decrement it. A guard clause on the
       update means the second one matches no rows instead. */
    await tx.studioIdea.updateMany({
      where: { id: ideaId, saveCount: { gt: 0 } },
      data: { saveCount: { decrement: 1 } },
    });
    return true;
  });
}

/* ---- Spaces -------------------------------------------------------------- */

/** Enough columns to build a `SpaceView`; the items come separately
    because the list page needs counts and the detail page needs rows. */
const SPACE_SELECT = {
  id: true,
  slug: true,
  name: true,
  room: true,
  description: true,
  notes: true,
  budgetPaise: true,
  visibility: true,
  projectId: true,
  updatedAt: true,
  coverIdea: { select: { id: true, assetPath: true, fileId: true } },
} satisfies Prisma.StudioSpaceSelect;

type SpaceRow = Prisma.StudioSpaceGetPayload<{ select: typeof SPACE_SELECT }>;

function toSpaceView(
  row: SpaceRow,
  totals: { ideas: number; products: number; plannedPaise: Paise },
): SpaceView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    room: ROOM_FROM_DB[row.room],
    description: row.description,
    /* The collage is built by `listSpaces`, which is the only caller with
       the board's pins in hand. Everywhere else a board is read one at a
       time and its cover alone is the picture. */
    coverUrls: row.coverIdea ? [imageUrlFor(row.coverIdea)] : [],
    coverUrl: row.coverIdea ? imageUrlFor(row.coverIdea) : null,
    ideaCount: totals.ideas,
    productCount: totals.products,
    budgetPaise: row.budgetPaise,
    plannedPaise: totals.plannedPaise,
    visibility: VISIBILITY_FROM_DB[row.visibility],
    projectId: row.projectId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSpaces(userId: string): Promise<SpaceView[]> {
  const rows = await db.studioSpace.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: SPACE_SELECT,
  });
  if (rows.length === 0) return [];

  const items = await db.studioSpaceItem.findMany({
    where: { spaceId: { in: rows.map((r) => r.id) } },
    orderBy: { createdAt: "desc" },
    select: {
      spaceId: true,
      kind: true,
      qty: true,
      unitPricePaise: true,
      /* The image columns ride along for the cover collage. Still one
         query for every board on the page — a collage built with its own
         "three pins per board" query would be one round trip per card,
         which is exactly what this function exists to avoid. */
      idea: { select: { id: true, assetPath: true, fileId: true } },
    },
  });

  const bySpace = new Map<string, typeof items>();
  for (const item of items) {
    const list = bySpace.get(item.spaceId);
    if (list) list.push(item);
    else bySpace.set(item.spaceId, [item]);
  }

  return rows.map((row) => {
    const own = bySpace.get(row.id) ?? [];

    /* The chosen cover first, then the most recent pins after it, with
       no repeats — a collage whose three panes are the same photograph
       three times is worse than one pane.

       Deduped by pin, not by URL. Most pins have no photograph yet and
       `imageUrlFor` returns null for all of them, so a URL-keyed check
       would treat three different rooms as one repeat and leave a board
       of twelve pins with a single pane. It also fixes the same bug for
       two pins that genuinely share a file. */
    const covers: (string | null)[] = [];
    const seen = new Set<string>();
    const addCover = (idea: {
      id: string;
      assetPath: string | null;
      fileId: string | null;
    }) => {
      if (covers.length >= 3 || seen.has(idea.id)) return;
      seen.add(idea.id);
      covers.push(imageUrlFor(idea));
    };

    if (row.coverIdea) addCover(row.coverIdea);
    for (const item of own) {
      if (item.idea) addCover(item.idea);
    }

    return {
      /* `coverUrls` below replaces the single-cover default
         `toSpaceView` sets. */
      ...toSpaceView(
        row,
        summariseItems(
          own.map((i) => ({
            kind: ITEM_KIND_FROM_DB[i.kind],
            qty: i.qty,
            unitPricePaise: i.unitPricePaise,
          })),
        ),
      ),
      coverUrls: covers,
    };
  });
}

const ITEM_SELECT = {
  id: true,
  kind: true,
  title: true,
  brand: true,
  surface: true,
  qty: true,
  unit: true,
  unitPricePaise: true,
  position: true,
  hex: true,
  productSlug: true,
  variantId: true,
  idea: { select: IDEA_SELECT },
} satisfies Prisma.StudioSpaceItemSelect;

type ItemRow = Prisma.StudioSpaceItemGetPayload<{ select: typeof ITEM_SELECT }>;

function toItemView(row: ItemRow, savedIds: Set<string> | null): SpaceItemView {
  return {
    id: row.id,
    kind: ITEM_KIND_FROM_DB[row.kind],
    title: row.title,
    brand: row.brand,
    surface: row.surface,
    qty: row.qty,
    unit: row.unit,
    unitPricePaise: row.unitPricePaise,
    position: row.position,
    hex: row.hex,
    productSlug: row.productSlug,
    variantId: row.variantId,
    idea: row.idea ? toIdeaView(row.idea, savedIds) : null,
  };
}

/**
 * One room, with everything in it.
 *
 * `viewerId` is who is asking, which is not necessarily the owner: a
 * `PUBLIC` space is readable by anyone, including signed-out visitors, so
 * that a shared link works. `canEdit` is what the caller uses to decide
 * whether to render controls — it is never the only thing standing
 * between a stranger and a write, which is enforced separately on every
 * mutation below.
 */
export async function getSpace(
  idOrSlug: string,
  viewerId: string | null,
): Promise<(SpaceDetailView & { canEdit: boolean }) | null> {
  const row = await db.studioSpace.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      AND: [
        { OR: [{ visibility: "PUBLIC" }, ...(viewerId ? [{ userId: viewerId }] : [])] },
      ],
    },
    select: { ...SPACE_SELECT, userId: true },
  });
  if (!row) return null;

  const itemRows = await db.studioSpaceItem.findMany({
    where: { spaceId: row.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: ITEM_SELECT,
  });

  const saved = await savedIdSet(
    viewerId,
    itemRows.map((i) => i.idea?.id).filter((id): id is string => Boolean(id)),
  );

  const items = itemRows.map((r) => toItemView(r, saved));
  const totals = summariseItems(items);

  return {
    ...toSpaceView(row, totals),
    notes: row.notes,
    items,
    canEdit: viewerId === row.userId,
  };
}

export interface NewSpaceInput {
  name: string;
  room?: StudioRoom;
  description?: string;
  budgetPaise?: number;
  projectId?: string;
  visibility?: Visibility;
}

export async function createSpace(
  userId: string,
  input: NewSpaceInput,
): Promise<SpaceView> {
  /* A project id arrives from a client and is a cuid; without this it
     would be possible to hang a room off somebody else's build. */
  if (input.projectId) {
    const project = await db.project.findFirst({
      where: { id: input.projectId, userId },
      select: { id: true },
    });
    if (!project) throw new StudioError("not_found", "No such project");
  }

  const row = await db.studioSpace.create({
    data: {
      userId,
      slug: slugify(input.name),
      name: input.name.trim(),
      room: ROOM_TO_DB[input.room ?? "other"],
      description: input.description?.trim() ?? "",
      budgetPaise: input.budgetPaise ?? 0,
      projectId: input.projectId ?? null,
      visibility: VISIBILITY_TO_DB[input.visibility ?? "private"],
    },
    select: SPACE_SELECT,
  });

  return toSpaceView(row, { ideas: 0, products: 0, plannedPaise: 0 });
}

export interface SpacePatch {
  name?: string;
  room?: StudioRoom;
  description?: string;
  notes?: string;
  budgetPaise?: number;
  coverIdeaId?: string | null;
  projectId?: string | null;
  visibility?: Visibility;
}

/**
 * Edits a room.
 *
 * `updateMany` scoped by `userId`, not `update` by id: `update` on a row
 * that is not yours throws a Prisma error a route then has to translate,
 * and the translation is the place the check gets forgotten. A count of
 * zero here means "not yours or not there", which are the same answer.
 */
export async function updateSpace(
  userId: string,
  id: string,
  patch: SpacePatch,
): Promise<boolean> {
  if (patch.coverIdeaId) {
    /* The cover must be an idea that is actually in this room, or the
       card on the Spaces page shows a photograph the room does not
       contain. */
    const item = await db.studioSpaceItem.findFirst({
      where: { spaceId: id, kind: "IDEA", ideaId: patch.coverIdeaId, space: { userId } },
      select: { id: true },
    });
    if (!item) throw new StudioError("not_found", "That idea is not in this space");
  }

  if (patch.projectId) {
    const project = await db.project.findFirst({
      where: { id: patch.projectId, userId },
      select: { id: true },
    });
    if (!project) throw new StudioError("not_found", "No such project");
  }

  const { count } = await db.studioSpace.updateMany({
    where: { id, userId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.room !== undefined ? { room: ROOM_TO_DB[patch.room] } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description.trim() }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.budgetPaise !== undefined ? { budgetPaise: patch.budgetPaise } : {}),
      ...(patch.coverIdeaId !== undefined ? { coverIdeaId: patch.coverIdeaId } : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.visibility !== undefined
        ? { visibility: VISIBILITY_TO_DB[patch.visibility] }
        : {}),
    },
  });
  return count > 0;
}

export async function deleteSpace(userId: string, id: string): Promise<boolean> {
  const { count } = await db.studioSpace.deleteMany({ where: { id, userId } });
  return count > 0;
}

/* ---- Items in a space ---------------------------------------------------- */

export interface NewItemInput {
  kind: ItemKind;
  ideaId?: string;
  productSlug?: string;
  variantId?: string;
  title?: string;
  brand?: string;
  hex?: string;
  surface?: string;
  qty?: number;
  unit?: string;
  unitPricePaise?: number;
}

/**
 * Which columns each kind actually requires.
 *
 * The schema cannot express this — every column is nullable so that one
 * table can hold five kinds — so it is stated once, here, at the only
 * place rows are created. Without it a `COLOR` with no hex renders as an
 * invisible swatch and a `PRODUCT` with no slug is a card that links
 * nowhere.
 */
function validateItem(input: NewItemInput): void {
  switch (input.kind) {
    case "idea":
      if (!input.ideaId) throw new StudioError("bad_request", "Which idea?");
      return;
    case "product":
      if (!input.productSlug) throw new StudioError("bad_request", "Which product?");
      if (!input.title?.trim()) throw new StudioError("bad_request", "The product needs a name");
      return;
    case "color":
      if (!input.hex) throw new StudioError("bad_request", "A colour needs a hex value");
      return;
    case "material":
    case "note":
      if (!input.title?.trim()) throw new StudioError("bad_request", "Give it a name");
      return;
  }
}

/**
 * Adds one thing to a room.
 *
 * New items go on the end. `position` is read as `max + 1` inside the
 * same transaction as the insert, so two tabs adding at once cannot both
 * claim the same slot and leave the list ordering by creation date as a
 * tiebreak forever.
 */
export async function addSpaceItem(
  userId: string,
  spaceId: string,
  input: NewItemInput,
): Promise<SpaceItemView> {
  validateItem(input);

  const space = await db.studioSpace.findFirst({
    where: { id: spaceId, userId },
    select: { id: true, coverIdeaId: true },
  });
  if (!space) throw new StudioError("not_found", "No such space");

  if (input.kind === "idea" && input.ideaId) {
    const idea = await db.studioIdea.findFirst({
      where: { id: input.ideaId, OR: [{ visibility: "PUBLIC" }, { userId }] },
      select: { id: true },
    });
    if (!idea) throw new StudioError("not_found", "No such idea");
  }

  const row = await db.$transaction(async (tx) => {
    const last = await tx.studioSpaceItem.findFirst({
      where: { spaceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const created = await tx.studioSpaceItem.create({
      data: {
        spaceId,
        kind: ITEM_KIND_TO_DB[input.kind],
        ideaId: input.kind === "idea" ? (input.ideaId ?? null) : null,
        productSlug: input.kind === "product" ? (input.productSlug ?? null) : null,
        variantId: input.kind === "product" ? (input.variantId ?? null) : null,
        title: input.title?.trim() ?? "",
        brand: input.brand?.trim() ?? "",
        hex: input.kind === "color" ? (input.hex ?? null) : null,
        surface: input.surface?.trim() ?? "",
        qty: input.qty ?? 1,
        unit: input.unit?.trim() ?? "",
        unitPricePaise: input.unitPricePaise ?? 0,
        position: (last?.position ?? -1) + 1,
      },
      select: ITEM_SELECT,
    });

    /* First idea into an empty room becomes its cover, and touching the
       space is what keeps the Spaces page ordered by "recently worked
       on" rather than by creation. */
    await tx.studioSpace.update({
      where: { id: spaceId },
      data:
        input.kind === "idea" && !space.coverIdeaId
          ? { coverIdeaId: input.ideaId, updatedAt: new Date() }
          : { updatedAt: new Date() },
    });

    return created;
  });

  return toItemView(row, null);
}

export async function removeSpaceItem(
  userId: string,
  spaceId: string,
  itemId: string,
): Promise<boolean> {
  const { count } = await db.studioSpaceItem.deleteMany({
    where: { id: itemId, spaceId, space: { userId } },
  });
  return count > 0;
}

export interface ItemPatch {
  title?: string;
  surface?: string;
  qty?: number;
  unit?: string;
  unitPricePaise?: number;
}

export async function updateSpaceItem(
  userId: string,
  spaceId: string,
  itemId: string,
  patch: ItemPatch,
): Promise<boolean> {
  const { count } = await db.studioSpaceItem.updateMany({
    where: { id: itemId, spaceId, space: { userId } },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.surface !== undefined ? { surface: patch.surface.trim() } : {}),
      ...(patch.qty !== undefined ? { qty: patch.qty } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit.trim() } : {}),
      ...(patch.unitPricePaise !== undefined
        ? { unitPricePaise: patch.unitPricePaise }
        : {}),
    },
  });
  return count > 0;
}

/**
 * Reorders a room's items.
 *
 * Takes the whole ordered list of ids rather than a from/to pair: a drag
 * that arrives out of order — two quick drags on a slow connection — would
 * otherwise apply against a list the server no longer has, and the result
 * is an order neither the client nor anyone else asked for. Sending the
 * intended final order makes the last write win, which is the behaviour a
 * person dragging things expects.
 *
 * Ids that do not belong to this space are ignored rather than rejected,
 * so a stale tab cannot fail the whole reorder.
 */
export async function reorderSpaceItems(
  userId: string,
  spaceId: string,
  orderedIds: string[],
): Promise<boolean> {
  const space = await db.studioSpace.findFirst({
    where: { id: spaceId, userId },
    select: { id: true },
  });
  if (!space) return false;

  const owned = new Set(
    (
      await db.studioSpaceItem.findMany({
        where: { spaceId, id: { in: orderedIds } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );

  const updates = orderedIds
    .filter((id) => owned.has(id))
    .map((id, index) =>
      db.studioSpaceItem.update({ where: { id }, data: { position: index } }),
    );
  if (updates.length === 0) return true;

  await db.$transaction(updates);
  return true;
}

/* ---- Moodboards ---------------------------------------------------------- */

const MOODBOARD_SELECT = {
  id: true,
  spaceId: true,
  title: true,
  canvasWidth: true,
  canvasHeight: true,
  items: {
    orderBy: [{ z: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      id: true,
      itemId: true,
      x: true,
      y: true,
      width: true,
      height: true,
      z: true,
      item: { select: ITEM_SELECT },
    },
  },
} satisfies Prisma.MoodboardSelect;

type MoodboardRow = Prisma.MoodboardGetPayload<{ select: typeof MOODBOARD_SELECT }>;

function toMoodboardView(row: MoodboardRow): MoodboardView {
  return {
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    canvasWidth: row.canvasWidth,
    canvasHeight: row.canvasHeight,
    items: row.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      x: i.x,
      y: i.y,
      width: i.width,
      height: i.height,
      z: i.z,
      item: toItemView(i.item, null),
    })),
  };
}

/**
 * The canvas for a room, created on first look.
 *
 * A Space and its board are one thing to the person using them, so there
 * is no "create moodboard" step to fail at — opening the tab is the
 * creation. `upsert` rather than find-then-create because two tabs
 * opening it at once would otherwise race on a table with a unique
 * `spaceId`.
 */
export async function getOrCreateMoodboard(
  spaceId: string,
  viewerId: string | null,
): Promise<(MoodboardView & { canEdit: boolean }) | null> {
  const space = await db.studioSpace.findFirst({
    where: {
      id: spaceId,
      OR: [{ visibility: "PUBLIC" }, ...(viewerId ? [{ userId: viewerId }] : [])],
    },
    select: { id: true, name: true, userId: true },
  });
  if (!space) return null;

  const canEdit = viewerId === space.userId;

  /* A visitor looking at somebody's shared room must not create rows in
     it. They see the board if it exists and nothing if it does not,
     which is the honest answer for a room whose owner never arranged one. */
  if (!canEdit) {
    const existing = await db.moodboard.findUnique({
      where: { spaceId },
      select: MOODBOARD_SELECT,
    });
    return existing ? { ...toMoodboardView(existing), canEdit } : null;
  }

  const row = await db.moodboard.upsert({
    where: { spaceId },
    create: { spaceId, title: space.name },
    update: {},
    select: MOODBOARD_SELECT,
  });

  return { ...toMoodboardView(row), canEdit };
}

export interface MoodboardPlacement {
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

/**
 * Saves a whole board layout at once.
 *
 * The entire arrangement, not a delta. A canvas is edited by dragging,
 * which produces a stream of overlapping updates; applying those as
 * deltas means a dropped request leaves one tile somewhere its owner
 * never put it and nothing ever corrects it. Replacing the layout wholesale
 * makes the last save authoritative, and a save is cheap — a board is
 * tens of rows, not thousands.
 *
 * Placements naming items that are not in this space are dropped, so a
 * stale tab holding an item deleted a minute ago saves the rest of the
 * board instead of failing all of it.
 */
export async function saveMoodboardLayout(
  userId: string,
  spaceId: string,
  placements: MoodboardPlacement[],
  canvas?: { width: number; height: number },
): Promise<MoodboardView | null> {
  const space = await db.studioSpace.findFirst({
    where: { id: spaceId, userId },
    select: { id: true, name: true },
  });
  if (!space) return null;

  const valid = new Set(
    (
      await db.studioSpaceItem.findMany({
        where: { spaceId, id: { in: placements.map((p) => p.itemId) } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );

  const kept = placements.filter((p) => valid.has(p.itemId));

  const row = await db.$transaction(async (tx) => {
    const board = await tx.moodboard.upsert({
      where: { spaceId },
      create: {
        spaceId,
        title: space.name,
        ...(canvas ? { canvasWidth: canvas.width, canvasHeight: canvas.height } : {}),
      },
      update: canvas ? { canvasWidth: canvas.width, canvasHeight: canvas.height } : {},
      select: { id: true },
    });

    await tx.moodboardItem.deleteMany({ where: { moodboardId: board.id } });
    if (kept.length) {
      await tx.moodboardItem.createMany({
        data: kept.map((p) => ({ moodboardId: board.id, ...p })),
      });
    }

    /* The Spaces page orders by "recently worked on", and arranging a
       board is working on the room. */
    await tx.studioSpace.update({
      where: { id: spaceId },
      data: { updatedAt: new Date() },
    });

    return tx.moodboard.findUniqueOrThrow({
      where: { id: board.id },
      select: MOODBOARD_SELECT,
    });
  });

  return toMoodboardView(row);
}

/* ---- Shop this look ------------------------------------------------------ */

/**
 * What you could buy to build a room like this one.
 *
 * The materials and styles on an idea are run against the catalogue with
 * the same matcher a handwritten parcha goes through — one query per
 * term, run together rather than in sequence. That reuse is the point:
 * there is one definition in this app of "what does this word mean in the
 * catalogue", and Studio does not get a second one that drifts.
 *
 * Prices are the standard tier. Pro pricing is resolved on the product
 * page, where the customer's tier is known and where the number is
 * actually being committed to — an indicative total on an inspiration
 * page is not the place to start quoting trade rates.
 */
export async function shopTheLook(idea: IdeaView): Promise<ShopTheLook> {
  /* Materials first — "oak", "marble", "brass" are things the catalogue
     sells. Styles come after, because "minimal" occasionally names a real
     range, and a product found that way is still a real product. */
  const terms = [...idea.materials, ...idea.styles].slice(0, 8);
  if (terms.length === 0) return { matches: [], totalPaise: 0, unmatched: [] };

  const results = await matchParchaLines(terms);

  /* Term → slug, in the order the terms were written, dropping repeats.
     One product can be the best match for two terms — "oak" and "wood"
     both landing on the same laminate — and listing it twice would double
     it in the total. */
  const wanted = new Map<string, string>();
  const unmatched: string[] = [];

  for (let i = 0; i < terms.length; i++) {
    const found = results[i];
    if (!found) {
      unmatched.push(terms[i]);
      continue;
    }
    const slug = found.href.replace(/^\/p\//, "");
    if (!wanted.has(slug)) wanted.set(slug, terms[i]);
  }

  if (wanted.size === 0) return { matches: [], totalPaise: 0, unmatched };

  /* One query for every match, not one per match. `matchParchaLines`
     already cost a query per term; adding a second round trip each would
     make an eight-tag idea sixteen. */
  const rows = await db.product.findMany({
    where: { slug: { in: [...wanted.keys()] } },
    select: {
      slug: true,
      name: true,
      image: true,
      brand: { select: { name: true } },
      variants: {
        where: { isActive: true },
        orderBy: { pricePaise: "asc" },
        take: 1,
        select: { pricePaise: true },
      },
    },
  });

  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const matches: LookMatch[] = [];

  /* Walked in the order the terms were written, not the order Postgres
     returned rows in, so the list reads the way the idea does. */
  for (const [slug, term] of wanted) {
    const row = bySlug.get(slug);
    if (!row) {
      /* Matched a moment ago and gone now — a SKU retired between the two
         queries. Reported as unmatched rather than as a card linking
         nowhere. */
      unmatched.push(term);
      continue;
    }

    matches.push({
      term,
      slug: row.slug,
      title: row.name,
      brand: row.brand?.name ?? null,
      photo: results.find((r) => r?.href === `/p/${row.slug}`)?.photo,
      image: row.image,
      pricePaise: row.variants[0]?.pricePaise ?? 0,
    });
  }

  return {
    matches,
    totalPaise: matches.reduce((sum, m) => sum + m.pricePaise, 0),
    unmatched,
  };
}
