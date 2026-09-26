/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type StudioRoom } from "@prisma/client";
import sharp from "sharp";

const db = new PrismaClient();

/**
 * The photographs Studio ships with.
 *
 * Quoin owns no interiors photography. The only imagery in this repo that
 * is Quoin's own is the commissioned category art in `public/categories/`
 * and the catalogue product shots, and a feed of borrowed interiors —
 * scraped, hotlinked, or lifted off a stock site without a licence —
 * is the single most obviously stolen thing a storefront could put on its
 * front page. `src/components/storefront/home/Rooms.tsx` already recorded
 * that decision for the home page; this is the same decision, held.
 *
 * So the seed is small and it is honest. Fourteen commissioned group
 * shots, tagged with what is actually in each frame, marked as Quoin's
 * own (`userId: null`), and public. Everything after that comes from
 * people who upload a room they built — which is what `/studio/upload`
 * exists for and why it is one field away from being a single tap.
 *
 * Idempotent: re-running updates the tags on a seeded row rather than
 * making a fourteenth copy of the same laminate. Keyed on `assetPath`,
 * which is the one thing about a seeded idea that never changes.
 *
 * ## Two tiers, and which one is the wall
 *
 * There are now two sources of seeded pins and they are not equals.
 *
 * `public/studio/manifest.json`, written by
 * `scripts/generate-studio-images.ts`, holds **rooms** — a bedroom with a
 * jaali headboard, a kitchen in white and oak, a balcony at seven in the
 * evening. That is what Studio is for, and when the manifest has entries
 * they are the wall.
 *
 * The fourteen seeds below are **departments** — "Waterproofing", "Tools
 * and site safety". They were only ever in the wall because the wall
 * would otherwise be empty, which the note on `kind` further down said in
 * as many words. The moment there are real rooms, that reason is gone.
 *
 * So `kind` is decided by whether the manifest has anything in it: with
 * rooms present the departments become `PRODUCT` and leave the discovery
 * feed, keeping their URLs, their tags and their priced lines — which are
 * genuinely useful on a category page and were never inspiration. With no
 * rooms they stay `SPACE` and the wall is what it was. Nothing is
 * deleted, no flag has to be remembered, and generating the images is the
 * whole of the switch.
 *
 * Run with:
 *   npx tsx scripts/generate-studio-images.ts   # once, costs money
 *   npx tsx prisma/seed-studio.ts
 */

interface Seed {
  assetPath: string;
  title: string;
  description: string;
  room: StudioRoom | null;
  styles: string[];
  /* These are what "Shop this look" searches the catalogue for, so they
     are real material names rather than adjectives. A tag that matches
     nothing is shown as unmatched, which is honest but useless — so
     every one here was chosen because the catalogue actually has it. */
  materials: string[];
  colors: { hex: string; name: string }[];
}

const SEEDS: Seed[] = [
  {
    assetPath: "/categories/bathware-plumbing.webp",
    title: "Bathroom fittings, laid out",
    description:
      "Sanitaryware, mixers and shower fittings — the pieces a bathroom is assembled from.",
    room: "BATHROOM",
    styles: ["modern", "minimal"],
    materials: ["ceramic", "chrome", "brass"],
    colors: [
      { hex: "#f2efe9", name: "Soft white" },
      { hex: "#b9bcc0", name: "Brushed chrome" },
    ],
  },
  {
    assetPath: "/categories/kitchen-sinks-faucets.webp",
    title: "Kitchen sinks and taps",
    description: "Quartz and steel bowls with the mixers that go on them.",
    room: "KITCHEN",
    styles: ["modern", "minimal"],
    materials: ["quartz", "steel", "granite"],
    colors: [
      { hex: "#3c3f42", name: "Charcoal quartz" },
      { hex: "#c9ccd0", name: "Stainless" },
    ],
  },
  {
    assetPath: "/categories/kitchen-wardrobe-fittings.webp",
    title: "Kitchen and wardrobe hardware",
    description: "Hinges, channels, baskets and the fittings a fitted kitchen runs on.",
    room: "KITCHEN",
    styles: ["contemporary"],
    materials: ["steel", "aluminium"],
    colors: [{ hex: "#8d9296", name: "Anodised grey" }],
  },
  {
    assetPath: "/categories/plywood-laminates.webp",
    title: "Plywood and laminate finishes",
    description: "Wood-toned surfaces for joinery, shutters and wardrobes.",
    room: null,
    styles: ["warm", "contemporary"],
    materials: ["plywood", "laminate", "oak", "wood"],
    colors: [
      { hex: "#c9a377", name: "Natural oak" },
      { hex: "#8a6440", name: "Walnut" },
    ],
  },
  {
    assetPath: "/categories/tiling-adhesives.webp",
    title: "Tile, stone and what holds it down",
    description: "Floor and wall tile with the adhesives and grouts they need.",
    room: null,
    styles: ["modern"],
    materials: ["tile", "marble", "stone", "adhesive"],
    colors: [
      { hex: "#ded8cf", name: "Bone" },
      { hex: "#6f6a63", name: "Slate" },
    ],
  },
  {
    assetPath: "/categories/paints-finishes.webp",
    title: "Paints and wall finishes",
    description: "Emulsions, primers and textures for interior and exterior walls.",
    room: null,
    styles: ["minimal"],
    materials: ["paint", "primer", "putty"],
    colors: [
      { hex: "#e8ddcd", name: "Warm beige" },
      { hex: "#f6f4f0", name: "Off white" },
    ],
  },
  {
    assetPath: "/categories/electricals-lighting.webp",
    title: "Lighting and switchgear",
    description: "Fittings, switches, fans and the wiring behind them.",
    room: null,
    styles: ["modern", "minimal"],
    materials: ["aluminium", "copper", "glass"],
    colors: [
      { hex: "#f0e6d2", name: "Warm white light" },
      { hex: "#2f2c29", name: "Matte black" },
    ],
  },
  {
    assetPath: "/categories/hardware-locks.webp",
    title: "Door hardware and locks",
    description: "Handles, hinges, cylinders and closers.",
    room: "ENTRANCE",
    styles: ["contemporary"],
    materials: ["brass", "steel", "zinc"],
    colors: [
      { hex: "#b08b45", name: "Antique brass" },
      { hex: "#8b8f93", name: "Satin nickel" },
    ],
  },
  {
    assetPath: "/categories/gypsum-false-ceiling.webp",
    title: "False ceilings",
    description: "Gypsum board, sections and the trims that finish a ceiling.",
    room: "LIVING_ROOM",
    styles: ["modern", "minimal"],
    materials: ["gypsum", "plaster"],
    colors: [{ hex: "#f4f2ee", name: "Ceiling white" }],
  },
  {
    assetPath: "/categories/cement-steel.webp",
    title: "Cement and steel",
    description: "The structure under everything else.",
    room: null,
    styles: ["industrial"],
    materials: ["cement", "steel", "concrete"],
    colors: [{ hex: "#9a9691", name: "Raw concrete" }],
  },
  {
    assetPath: "/categories/waterproofing.webp",
    title: "Waterproofing",
    description: "Membranes and coatings for terraces, bathrooms and basements.",
    room: null,
    styles: [],
    materials: ["waterproofing", "membrane"],
    colors: [{ hex: "#5a6b74", name: "Slate blue" }],
  },
  {
    assetPath: "/categories/home-appliances-security.webp",
    title: "Appliances and security",
    description: "Built-in appliances, cameras and access control.",
    room: "KITCHEN",
    styles: ["modern"],
    materials: ["steel", "glass"],
    colors: [{ hex: "#2b2b2d", name: "Graphite" }],
  },
  {
    assetPath: "/categories/tools-safety.webp",
    title: "Tools and site safety",
    description: "What the people building it need on site.",
    room: null,
    styles: ["industrial"],
    materials: ["steel"],
    colors: [{ hex: "#c8571f", name: "Site orange" }],
  },
  {
    assetPath: "/categories/services.webp",
    title: "The trades",
    description: "Installation and fitting, booked through Quoin.",
    room: null,
    styles: [],
    materials: [],
    colors: [],
  },
];

/** No O, 0, I, 1 — matches `slugify` in `src/lib/data/studio.ts`. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function slugFor(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join("-");
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${base}-${suffix}`;
}

/**
 * The real dimensions and a blurred placeholder, read off the file.
 *
 * `sharp` is already a dependency (`scripts/generate-product-images.ts`
 * uses it) and is the only thing here that touches the bytes. The
 * placeholder is 16px on the long edge at low quality — a few hundred
 * bytes of data URI, which is what makes it affordable to inline into
 * every card in the grid.
 */
async function describe(assetPath: string) {
  const file = path.join("public", assetPath.replace(/^\//, ""));
  const bytes = await readFile(file);

  const image = sharp(bytes);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read the dimensions of ${assetPath}`);
  }

  const blur = await sharp(bytes)
    .resize(16, 16, { fit: "inside" })
    .jpeg({ quality: 50 })
    .toBuffer();

  return {
    width: meta.width,
    height: meta.height,
    blurDataUrl: `data:image/jpeg;base64,${blur.toString("base64")}`,
  };
}

/** How many catalogue lines each seeded room gets. Six is what the
    materials list shows before "Show N more", so it exercises the list
    without needing the expander on every single pin. */
const LINES_PER_ROOM = 6;

/**
 * The materials list for each seeded room.
 *
 * Matched by *category*, not by fuzzy text: every one of these
 * photographs is a department shot and its `assetPath` is literally
 * `/categories/<slug>.webp`, so the products in the frame are the
 * products in that category. That is an exact join rather than a guess,
 * which matters here for the same reason it matters in
 * `matchParchaLines` — a wrong product on a priced list is worse than a
 * short list.
 *
 * **Quantities are one of each, and coordinates are null.** Neither can
 * be derived from a photograph, and inventing either would make the
 * total under the picture a number nobody agreed to and the dots a claim
 * about where things are that is simply false. `StudioHotspot` allows a
 * line with no coordinate on purpose — it renders in the list and not on
 * the image. Real quantities and real dots arrive with real room
 * photography; until then the list is honest about being a list.
 *
 * Idempotent: a room's lines are replaced wholesale, so re-running after
 * a catalogue import refreshes them rather than stacking a second set.
 */
async function seedHotspots(): Promise<number> {
  let written = 0;

  for (const seed of SEEDS) {
    const categorySlug = seed.assetPath.replace("/categories/", "").replace(".webp", "");

    const idea = await db.studioIdea.findFirst({
      where: { assetPath: seed.assetPath, userId: null },
      select: { id: true },
    });
    if (!idea) continue;

    const where = {
      isActive: true,
      category: { slug: categorySlug },
      variants: { some: { isActive: true } },
    };

    /* Photographed rows first, in their own query rather than an
       `orderBy` on it — `Product.image` is a non-null column that is
       empty until a picture exists, so "has one" is a `not: ""` filter
       and not a sort key. Topped up from the rest of the department only if
       there are not six with a picture, because a list of six grey
       placeholders is technically correct and reads as broken. */
    const photographed = await db.product.findMany({
      where: { ...where, image: { not: "" } },
      orderBy: { name: "asc" },
      take: LINES_PER_ROOM,
      select: { slug: true },
    });

    const products =
      photographed.length >= LINES_PER_ROOM
        ? photographed
        : [
            ...photographed,
            ...(await db.product.findMany({
              where: { ...where, image: "" },
              orderBy: { name: "asc" },
              take: LINES_PER_ROOM - photographed.length,
              select: { slug: true },
            })),
          ];

    await db.studioHotspot.deleteMany({ where: { ideaId: idea.id } });
    if (products.length === 0) continue;

    await db.studioHotspot.createMany({
      data: products.map((product, index) => ({
        ideaId: idea.id,
        productSlug: product.slug,
        x: null,
        y: null,
        qty: 1,
        unit: "",
        position: index,
      })),
    });
    written += products.length;
  }

  return written;
}

/* ---- Rooms, from the generator's manifest -------------------------------- */

/** Exactly what `scripts/generate-studio-images.ts` writes per image. */
interface ManifestEntry {
  assetPath: string;
  title: string;
  description: string;
  room: StudioRoom;
  styles: string[];
  materials: string[];
  colors: { hex: string; name: string }[];
  width: number;
  height: number;
  blurDataUrl: string;
}

const MANIFEST = path.join("public", "studio", "manifest.json");

/**
 * The generated rooms, or none.
 *
 * A missing manifest is the ordinary state of a fresh clone, not an
 * error — generating the images costs money and is a deliberate, separate
 * step. An entry whose image is not actually on disk is dropped rather
 * than seeded: `imageUrlFor` would hand the tile a path that 404s, which
 * renders worse than the stand-in it was meant to replace.
 */
async function readRooms(): Promise<ManifestEntry[]> {
  let parsed: Record<string, ManifestEntry>;
  try {
    parsed = JSON.parse(await readFile(MANIFEST, "utf8")) as Record<string, ManifestEntry>;
  } catch {
    return [];
  }

  const rooms: ManifestEntry[] = [];
  for (const entry of Object.values(parsed)) {
    const file = path.join("public", entry.assetPath.replace(/^\//, ""));
    if (existsSync(file)) rooms.push(entry);
  }
  return rooms;
}

/**
 * One pin per generated room.
 *
 * The manifest already carries the dimensions and the blur placeholder —
 * `describe` is not called here, because the generator read them off the
 * bytes it had just encoded and re-opening every file to learn the same
 * numbers is work for nothing.
 *
 * **No hotspots, deliberately.** A `StudioHotspot` says "this room used
 * three bags of this, and it is at these coordinates", and neither half
 * of that is knowable about an illustration nobody built. Inventing a
 * bill of materials would put a total under the picture that no one
 * agreed to — the exact thing `LookMatch` refuses a confidence score
 * over. What these rooms have instead is their tags, and "Shop this
 * look" matches those against the catalogue and says which word each
 * product came from. Real lines, real dots and real quantities arrive
 * with a real room, from `scripts/attach-studio-clip.ts`'s sibling or
 * from a customer's own upload.
 */
async function seedRooms(rooms: ManifestEntry[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const entry of rooms) {
    const existing = await db.studioIdea.findFirst({
      where: { assetPath: entry.assetPath, userId: null },
      select: { id: true },
    });

    const data = {
      title: entry.title,
      description: entry.description,
      width: entry.width,
      height: entry.height,
      blurDataUrl: entry.blurDataUrl,
      room: entry.room,
      styles: entry.styles,
      materials: entry.materials,
      colors: entry.colors,
      visibility: "PUBLIC" as const,
      kind: "SPACE" as const,
      /* Null, and it stays null. These are illustrations of the kind of
         room Quoin's catalogue builds, not photographs of a flat in
         Dwarka, and a `location` would be the one line on the card that
         claimed otherwise. The storefront's rule on generated imagery,
         held here. */
      location: null,
    };

    if (existing) {
      await db.studioIdea.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await db.studioIdea.create({
        data: { ...data, slug: slugFor(entry.title), assetPath: entry.assetPath },
      });
      created += 1;
    }
  }

  return { created, updated };
}

async function main() {
  const rooms = await readRooms();
  /* The one decision this file makes. See the note at the top: with real
     rooms the departments are not inspiration and leave the wall; with
     none they are all the wall has. */
  const departmentKind = rooms.length > 0 ? ("PRODUCT" as const) : ("SPACE" as const);

  let created = 0;
  let updated = 0;

  for (const seed of SEEDS) {
    const { width, height, blurDataUrl } = await describe(seed.assetPath);

    /* `assetPath` is not unique in the schema — a customer could, in
       principle, have an idea pointing at the same shipped file — so this
       is a find-then-write rather than an upsert. Scoped to `userId:
       null`, which is what "Quoin's own" means here. */
    const existing = await db.studioIdea.findFirst({
      where: { assetPath: seed.assetPath, userId: null },
      select: { id: true },
    });

    const data = {
      title: seed.title,
      description: seed.description,
      width,
      height,
      blurDataUrl,
      room: seed.room,
      styles: seed.styles,
      materials: seed.materials,
      colors: seed.colors,
      visibility: "PUBLIC" as const,
      /* `SPACE` only while there is nothing better. See `StudioIdeaKind`
         in the schema for what the two values mean, and the note at the
         top of this file for why this one is computed rather than fixed.

         Said plainly: these are department photographs, not finished
         rooms. They were in the wall because the wall would otherwise be
         empty, and the day `public/studio/` has rooms in it that stops
         being true — so this flips to `PRODUCT`, they leave the discovery
         feed, and they keep their URLs, their tags and their priced
         lines, which were always more useful on a category page than as
         inspiration. `location` stays null either way rather than being
         filled with a plausible "3BHK · Dwarka" nobody has been to. */
      kind: departmentKind,
    };

    if (existing) {
      await db.studioIdea.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await db.studioIdea.create({
        data: { ...data, slug: slugFor(seed.title), assetPath: seed.assetPath },
      });
      created += 1;
    }
  }

  const hotspots = await seedHotspots();
  const seeded = await seedRooms(rooms);

  console.log(`[studio] departments: ${created} created, ${updated} updated, kind=${departmentKind}.`);
  console.log(`[studio] ${hotspots} material lines written.`);

  if (rooms.length === 0) {
    console.log(
      `[studio] rooms: none. public/studio/ has no manifest, so the wall is ` +
        `the fourteen department photographs and every tile renders as the ` +
        `stand-in — see imageUrlFor. Run scripts/generate-studio-images.ts ` +
        `to change that.`,
    );
  } else {
    console.log(
      `[studio] rooms: ${seeded.created} created, ${seeded.updated} updated ` +
        `from ${MANIFEST}.`,
    );
    console.log(
      `[studio] the departments have left the wall. They keep their URLs ` +
        `and their priced lines; the wall is now ${rooms.length} rooms.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
