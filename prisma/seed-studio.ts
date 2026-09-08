/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { readFile } from "node:fs/promises";
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
 * Run with:  npx tsx prisma/seed-studio.ts
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

async function main() {
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

  console.log(`[studio] ${created} ideas created, ${updated} updated.`);
  console.log(
    "[studio] These are Quoin's own commissioned category photographs. " +
      "The feed grows from customer uploads at /studio/upload.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
