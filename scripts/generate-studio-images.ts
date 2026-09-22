/**
 * Generate the interiors photography Studio ships with.
 *
 *   npx tsx scripts/generate-studio-images.ts --dry-run
 *   npx tsx scripts/generate-studio-images.ts --limit 8
 *   npx tsx scripts/generate-studio-images.ts
 *
 * Why this exists at all is recorded in `prisma/seed-studio.ts`: Quoin owns
 * no interiors photography, and a feed of rooms scraped off Pinterest or
 * lifted from a design firm's portfolio — watermark removed or not — is
 * the most obviously stolen thing a storefront could publish. That ruled
 * out the zip of downloaded photographs this plan replaced. Generated
 * images are the one source that is both honest and ours: nobody else's
 * copyright, nobody's credit to strip.
 *
 * They are illustrations, not photographs of real projects, and the
 * storefront must keep saying so — the same rule `imageIsGenerated`
 * already enforces on catalogue art (`src/lib/images/generator.ts`).
 *
 * Resumable by construction: a spec whose image already exists on disk is
 * skipped, so an interrupted run is continued by running it again and
 * nothing is ever paid for twice. `--force` regenerates one anyway.
 *
 * Writes two things per spec:
 *   - `public/studio/<slug>.webp` — the image, portrait, re-encoded.
 *   - an entry in `public/studio/manifest.json` — the tags that become a
 *     `StudioIdea` row. Generation and seeding are separate steps because
 *     one costs money and the other does not; `prisma/seed-studio.ts`
 *     reads the manifest and can be re-run freely.
 */
/* Must be first: populates process.env before anything reads it. */
import "../src/lib/load-env-file";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import {
  DryRunGenerator,
  GeminiImageGenerator,
  OpenAiImageGenerator,
  type ImageGenerator,
} from "../src/lib/images/generator";

/** Served straight from `public/`, so the path is also the public URL. */
const OUT_DIR = path.join("public", "studio");
const MANIFEST = path.join(OUT_DIR, "manifest.json");

/* Image endpoints rate-limit hard, and a 429 storm costs more wall-clock
   than pacing does. Same figure as the catalogue generator. */
const DELAY_MS = 1200;
const MAX_FAILURES = 5;

/** Portrait. A feed of squares is a grid; a feed of tall tiles is a wall. */
const SIZE = "1024x1536" as const;

/* ---- Vocabulary ----------------------------------------------------------
 *
 * Styles and materials are not free text: the filter rail offers whatever
 * the ideas are tagged with (`listFacets`), and "Shop this look" searches
 * the catalogue for the material names. A tag nothing matches is honest
 * but useless, so both lists stay inside the vocabulary the seeded ideas
 * and the catalogue already use.
 */

type Room =
  | "LIVING_ROOM"
  | "KITCHEN"
  | "BEDROOM"
  | "BATHROOM"
  | "DINING"
  | "BALCONY"
  | "HOME_OFFICE"
  | "ENTRANCE";

type Style = "modern" | "minimal" | "contemporary" | "industrial" | "warm" | "traditional";

/** One palette per style, so a spec names a style and inherits its colours
    rather than repeating three hex codes sixty times. */
const STYLE_PALETTE: Record<Style, { hex: string; name: string }[]> = {
  modern: [
    { hex: "#f3f1ec", name: "Bone white" },
    { hex: "#3c3f42", name: "Charcoal" },
  ],
  minimal: [
    { hex: "#f7f5f1", name: "Chalk" },
    { hex: "#d8d2c6", name: "Oat" },
  ],
  contemporary: [
    { hex: "#e9e3d8", name: "Sand" },
    { hex: "#6b5a49", name: "Walnut" },
  ],
  industrial: [
    { hex: "#4a4a4a", name: "Raw concrete" },
    { hex: "#8a5a3b", name: "Oxide" },
  ],
  warm: [
    { hex: "#e6d2b5", name: "Sandstone" },
    { hex: "#9c4a2f", name: "Terracotta" },
  ],
  traditional: [
    { hex: "#7b2d26", name: "Lacquer red" },
    { hex: "#c9a227", name: "Old brass" },
  ],
};

interface Spec {
  /** Also the filename, and the key the manifest and seed are matched on. */
  slug: string;
  title: string;
  description: string;
  room: Room;
  style: Style;
  /** Extra tags beyond `style`, when a room genuinely reads as two. */
  alsoStyles?: Style[];
  materials: string[];
  /** The part of the prompt that describes this specific room. */
  subject: string;
}

const SPECS: Spec[] = [
  /* ---- Bedrooms ---- */
  {
    slug: "bedroom-teak-and-chalk",
    title: "Teak bed, chalk walls",
    description: "A quiet bedroom built on one warm wood and two pale walls.",
    room: "BEDROOM",
    style: "minimal",
    materials: ["teak", "wood", "paint", "cotton"],
    subject:
      "a calm bedroom with a low teak platform bed, chalk-white plaster walls, a single linen throw, bedside reading light",
  },
  {
    slug: "bedroom-jaali-headboard",
    title: "Carved jaali headboard",
    description: "A traditional carved screen behind the bed, kept plain either side.",
    room: "BEDROOM",
    style: "traditional",
    alsoStyles: ["warm"],
    materials: ["wood", "brass", "cotton"],
    subject:
      "a bedroom with a carved wooden jaali screen as the headboard, brass wall lamps, handloom bedcover, terracotta floor",
  },
  {
    slug: "bedroom-charcoal-panelled",
    title: "Charcoal panelled wall",
    description: "Fluted panelling in a dark stain, with warm light washing down it.",
    room: "BEDROOM",
    style: "modern",
    materials: ["laminate", "plywood", "paint"],
    subject:
      "a bedroom with a full-height fluted charcoal panelled wall behind the bed, concealed cove lighting, pale bedding",
  },
  {
    slug: "bedroom-green-upholstered",
    title: "Green upholstered bed",
    description: "One saturated colour, everything else left neutral.",
    room: "BEDROOM",
    style: "contemporary",
    materials: ["fabric", "wood", "marble"],
    subject:
      "a bedroom with a moss-green channel-tufted upholstered bed, oat walls, marble-topped bedside tables",
  },
  {
    slug: "bedroom-morning-balcony-door",
    title: "Bedroom that opens out",
    description: "A sliding door to a balcony, and the light it brings in at eight.",
    room: "BEDROOM",
    style: "modern",
    alsoStyles: ["minimal"],
    materials: ["glass", "aluminium", "wood"],
    subject:
      "a bedroom with a full-height sliding glass door to a planted balcony, sheer curtain, morning daylight across the floor",
  },
  {
    slug: "bedroom-lime-plaster-arch",
    title: "Lime plaster and an arch",
    description: "Soft plaster, a rounded niche, and nothing shiny.",
    room: "BEDROOM",
    style: "warm",
    materials: ["plaster", "wood", "cotton"],
    subject:
      "a bedroom with hand-finished lime plaster walls in warm sand, an arched niche beside the bed, cotton bedding",
  },

  /* ---- Bathrooms ---- */
  {
    slug: "bathroom-marble-and-chrome",
    title: "Marble and chrome",
    description: "Book-matched marble, one wall of it, and plain fittings.",
    room: "BATHROOM",
    style: "modern",
    materials: ["marble", "chrome", "ceramic", "glass"],
    subject:
      "a bathroom with a book-matched white marble wall, wall-hung ceramic basin, chrome mixer, frameless glass shower screen",
  },
  {
    slug: "bathroom-patterned-cement-tile",
    title: "Patterned cement floor",
    description: "A tiled floor doing the talking, walls kept flat.",
    room: "BATHROOM",
    style: "traditional",
    alsoStyles: ["warm"],
    materials: ["tile", "brass", "ceramic"],
    subject:
      "a bathroom with a patterned cement tile floor in terracotta and cream, plain plaster walls, brass fittings, wooden vanity",
  },
  {
    slug: "bathroom-green-zellige",
    title: "Green glazed tile",
    description: "Hand-glazed tile, uneven on purpose, under a round mirror.",
    room: "BATHROOM",
    style: "contemporary",
    materials: ["tile", "brass", "stone"],
    subject:
      "a bathroom with deep green hand-glazed zellige tiles, round mirror, brass tap, stone counter, small potted fern",
  },
  {
    slug: "bathroom-micro-cement-grey",
    title: "Seamless grey",
    description: "No grout lines: one continuous surface, floor to wall.",
    room: "BATHROOM",
    style: "minimal",
    materials: ["cement", "stone", "chrome"],
    subject:
      "a bathroom finished in seamless grey micro-cement across floor and walls, a stone trough basin, recessed shelf",
  },
  {
    slug: "bathroom-teak-slat-shower",
    title: "Teak slats in the wet area",
    description: "Warm wood where most bathrooms go cold.",
    room: "BATHROOM",
    style: "warm",
    materials: ["teak", "wood", "tile", "brass"],
    subject:
      "a bathroom with teak slatted wall panelling in the shower area, matte tiles, brass rain shower, folded towels",
  },
  {
    slug: "bathroom-small-flat-layout",
    title: "A small bathroom, planned",
    description: "Four by six feet, with a shower zone that still works.",
    room: "BATHROOM",
    style: "modern",
    alsoStyles: ["minimal"],
    materials: ["tile", "ceramic", "glass", "chrome"],
    subject:
      "a compact Indian apartment bathroom, glass shower partition, wall-hung WC, vertical stack of storage, light tiles",
  },

  /* ---- Kitchens ---- */
  {
    slug: "kitchen-quartz-and-steel",
    title: "Quartz counter, steel sink",
    description: "A working kitchen: durable top, deep bowl, nothing precious.",
    room: "KITCHEN",
    style: "modern",
    materials: ["quartz", "steel", "laminate"],
    subject:
      "an Indian kitchen with a charcoal quartz counter, undermount steel sink, handleless laminate shutters, tall pantry unit",
  },
  {
    slug: "kitchen-open-with-island",
    title: "Open kitchen with an island",
    description: "The island as prep space first, seating second.",
    room: "KITCHEN",
    style: "contemporary",
    materials: ["granite", "plywood", "wood"],
    subject:
      "an open-plan kitchen with a granite-topped island, two stools, plywood cabinetry in a warm veneer, pendant lights",
  },
  {
    slug: "kitchen-white-and-oak",
    title: "White and oak",
    description: "Pale cabinetry above, warm wood below.",
    room: "KITCHEN",
    style: "minimal",
    materials: ["oak", "laminate", "quartz", "tile"],
    subject:
      "a kitchen with white upper cabinets, oak base units, quartz counter, plain white tile backsplash, daylight from a window",
  },
  {
    slug: "kitchen-utility-corner",
    title: "The utility corner",
    description: "Where the washing machine and the mop actually live.",
    room: "KITCHEN",
    style: "modern",
    materials: ["tile", "steel", "laminate"],
    subject:
      "an Indian kitchen utility corner with a front-load washing machine under a counter, steel sink, tiled wall, drying rack",
  },

  /* ---- Living rooms ---- */
  {
    slug: "living-room-terracotta-floor",
    title: "Terracotta floor, low seating",
    description: "Floor seating, bolsters, and a cooled red floor.",
    room: "LIVING_ROOM",
    style: "traditional",
    alsoStyles: ["warm"],
    materials: ["terracotta", "tile", "wood", "cotton"],
    subject:
      "a living room with a terracotta tiled floor, low wooden seating with cotton bolsters, jaali screen, ceiling fan",
  },
  {
    slug: "living-room-grey-sectional",
    title: "Grey sectional, long window",
    description: "One large sofa, one long window, nothing else competing.",
    room: "LIVING_ROOM",
    style: "modern",
    materials: ["fabric", "glass", "marble"],
    subject:
      "a living room with a large grey fabric sectional, floor-to-ceiling window, marble coffee table, jute rug",
  },
  {
    slug: "living-room-brick-and-plants",
    title: "Exposed brick and plants",
    description: "Raw brick on one wall, greenery in front of it.",
    room: "LIVING_ROOM",
    style: "industrial",
    materials: ["brick", "steel", "wood", "concrete"],
    subject:
      "a living room with one exposed brick wall, black steel shelving, concrete floor, large potted plants, leather armchair",
  },
  {
    slug: "living-room-tv-wall-fluted",
    title: "Fluted TV wall",
    description: "The television wall treated as joinery, not an afterthought.",
    room: "LIVING_ROOM",
    style: "contemporary",
    materials: ["laminate", "plywood", "stone"],
    subject:
      "a living room with a fluted wood-finish television wall, floating stone console, warm strip lighting, low seating",
  },
  {
    slug: "living-room-swing-and-cane",
    title: "A jhoola by the window",
    description: "A swing seat, cane, and afternoon light.",
    room: "LIVING_ROOM",
    style: "warm",
    alsoStyles: ["traditional"],
    materials: ["wood", "cane", "cotton", "brass"],
    subject:
      "a living room with a wooden swing jhoola hung by the window, cane chairs, cotton cushions, brass accents, plants",
  },

  /* ---- Dining ---- */
  {
    slug: "dining-six-seater-wood",
    title: "Six seats, one slab",
    description: "A solid wood table that takes a full family meal.",
    room: "DINING",
    style: "contemporary",
    materials: ["wood", "teak", "fabric"],
    subject:
      "a dining area with a solid wood six-seater table, upholstered chairs, pendant light above, sideboard behind",
  },
  {
    slug: "dining-crockery-unit-wall",
    title: "Crockery unit wall",
    description: "Glass-fronted storage that earns its wall.",
    room: "DINING",
    style: "modern",
    materials: ["glass", "plywood", "laminate", "brass"],
    subject:
      "a dining area with a floor-to-ceiling glass-fronted crockery unit, warm interior lighting, compact four-seater table",
  },
  {
    slug: "dining-balcony-adjacent",
    title: "Dining beside the balcony",
    description: "A four-seater set where the light is best.",
    room: "DINING",
    style: "minimal",
    materials: ["wood", "glass", "cotton"],
    subject:
      "a small dining nook beside a balcony door, round wooden table, four chairs, sheer curtain, daylight",
  },

  /* ---- Home office ---- */
  {
    slug: "home-office-carved-desk",
    title: "Desk with carved front",
    description: "A working desk with one detail worth looking at.",
    room: "HOME_OFFICE",
    style: "traditional",
    materials: ["wood", "brass", "stone"],
    subject:
      "a home office with a wooden desk with a carved front panel, brass desk lamp, bookshelf, woven rug",
  },
  {
    slug: "home-office-pegboard-wall",
    title: "Pegboard wall",
    description: "Storage that moves as the work changes.",
    room: "HOME_OFFICE",
    style: "modern",
    materials: ["plywood", "steel", "paint"],
    subject:
      "a home office with a plywood pegboard wall, floating desk, task chair, steel shelf brackets, warm lamp",
  },
  {
    slug: "home-office-nook-in-bedroom",
    title: "A desk in the bedroom",
    description: "The corner most flats actually work in.",
    room: "HOME_OFFICE",
    style: "minimal",
    materials: ["laminate", "wood", "paint"],
    subject:
      "a compact study nook built into a bedroom corner, narrow laminate desk, open shelf above, chair, daylight from a window",
  },

  /* ---- Entrance ---- */
  {
    slug: "entrance-carved-door",
    title: "Carved entrance door",
    description: "The door as the first thing anyone touches.",
    room: "ENTRANCE",
    style: "traditional",
    materials: ["wood", "brass", "stone"],
    subject:
      "an apartment entrance with a carved wooden door, brass handle, stone flooring, a small console with a lamp",
  },
  {
    slug: "entrance-shoe-storage-bench",
    title: "Shoes, keys, a bench",
    description: "The three things an entrance has to solve.",
    room: "ENTRANCE",
    style: "modern",
    materials: ["laminate", "wood", "tile"],
    subject:
      "an entrance foyer with a closed shoe cabinet, a slim bench, key hooks, patterned floor tile, mirror",
  },

  /* ---- Balcony ---- */
  {
    slug: "balcony-deck-and-planters",
    title: "Deck and planters",
    description: "A balcony floored in wood, walled in green.",
    room: "BALCONY",
    style: "contemporary",
    materials: ["wood", "tile", "steel"],
    subject:
      "an apartment balcony with wooden deck flooring, railing planters, two chairs, a low table, string lights",
  },
  {
    slug: "balcony-swing-evening",
    title: "Balcony at seven",
    description: "A swing, a lamp, and the city behind.",
    room: "BALCONY",
    style: "warm",
    materials: ["steel", "cane", "cotton", "tile"],
    subject:
      "a balcony in the evening with a hanging cane swing chair, warm lantern light, cushions, plants, city skyline beyond",
  },
];

/**
 * The prompt for one room.
 *
 * Three things are held constant across every image so the feed reads as
 * one set rather than thirty unrelated renders: vertical framing, real
 * daylight, and no people. The negative clauses are not decoration — a
 * generated watermark or a fake brand name on a tile would be exactly the
 * problem the zip of downloaded photographs had, arrived at from the
 * other direction.
 */
export function buildStudioPrompt(spec: Spec): string {
  return [
    `Interior photograph of ${spec.subject}.`,
    ` Indian home, ${spec.style} style.`,
    " Natural daylight, photorealistic, editorial interiors photography,",
    " vertical portrait composition, shot at eye level, deep focus.",
    " No people, no text, no logos, no brand names, no watermark,",
    " no signature, no borders, no collage.",
  ]
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

interface ManifestEntry {
  assetPath: string;
  title: string;
  description: string;
  room: Room;
  styles: string[];
  materials: string[];
  colors: { hex: string; name: string }[];
  width: number;
  height: number;
  blurDataUrl: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Whichever provider this machine is actually funded for.
 *
 * Gemini first, and not on merit: it asks for a portrait aspect ratio
 * directly and bills about a third of OpenAI's rate per image. Either key
 * alone is enough, and `--provider` overrides the choice when both exist.
 * Neither set is a configuration error, not a silent no-op — the message
 * says which variable to add rather than leaving someone to read this file
 * to find out.
 */
function liveGenerator(): ImageGenerator {
  const preferred = arg("provider");
  const gemini = process.env.GEMINI_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();

  if (preferred === "openai" || (!gemini && openai)) {
    if (!openai) throw new Error("OPENAI_API_KEY is not set in .env.local");
    return new OpenAiImageGenerator(openai, "gpt-image-1", "medium", SIZE);
  }

  if (!gemini) {
    throw new Error(
      "No image provider key found. Add GEMINI_API_KEY (or OPENAI_API_KEY) to .env.local.",
    );
  }

  return new GeminiImageGenerator(gemini);
}

async function readManifest(): Promise<Record<string, ManifestEntry>> {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8")) as Record<string, ManifestEntry>;
  } catch {
    return {};
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const limit = Number(arg("limit")) || undefined;
  const only = arg("slug");

  let queue = SPECS;
  if (only) queue = queue.filter((s) => s.slug === only);
  if (!force) queue = queue.filter((s) => !existsSync(path.join(OUT_DIR, `${s.slug}.webp`)));
  if (limit) queue = queue.slice(0, limit);

  if (queue.length === 0) {
    console.log("Nothing to generate — every image already exists. Use --force to redo one.");
    return;
  }

  const generator: ImageGenerator = dryRun ? new DryRunGenerator() : liveGenerator();

  console.log(
    `${dryRun ? "Dry run" : "Generating"}: ${queue.length} of ${SPECS.length} images → ${OUT_DIR}`,
  );

  if (dryRun) {
    for (const spec of queue) {
      console.log(`\n── ${spec.slug}  [${spec.room}, ${spec.style}]`);
      console.log(`   title: ${spec.title}`);
      console.log(`   tags:  ${[spec.style, ...(spec.alsoStyles ?? [])].join(", ")} · ${spec.materials.join(", ")}`);
      console.log(`   ${buildStudioPrompt(spec)}`);
    }
    console.log(`\n${queue.length} prompts. Nothing was generated and nothing was charged.`);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const manifest = await readManifest();
  let failures = 0;

  for (const spec of queue) {
    try {
      const image = await generator.generate(buildStudioPrompt(spec));

      /* Re-encoded rather than written as returned: a 1024×1536 PNG is
         about 2 MB and the same picture as webp is a tenth of that, and
         this is a wall of thirty of them on a phone. */
      const file = `${spec.slug}.webp`;
      const encoded = await sharp(image.data).webp({ quality: 82 }).toBuffer();
      await writeFile(path.join(OUT_DIR, file), encoded);

      const meta = await sharp(encoded).metadata();
      /* The feed's masonry needs the ratio before the image loads, and the
         blur placeholder is what it shows meanwhile — both are recorded
         now so seeding never has to open the file again. */
      const blur = await sharp(encoded).resize(16).webp({ quality: 40 }).toBuffer();

      manifest[spec.slug] = {
        assetPath: `/studio/${file}`,
        title: spec.title,
        description: spec.description,
        room: spec.room,
        styles: [spec.style, ...(spec.alsoStyles ?? [])],
        materials: spec.materials,
        colors: STYLE_PALETTE[spec.style],
        width: meta.width ?? 1024,
        height: meta.height ?? 1536,
        blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
      };

      await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`✓ ${spec.slug}  (${Math.round(encoded.length / 1024)} KB)`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${spec.slug}: ${error instanceof Error ? error.message : error}`);
      if (failures >= MAX_FAILURES) {
        console.error(`Stopping after ${failures} failures.`);
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log(`\nDone. Manifest: ${MANIFEST}`);
  console.log("Next:  npx tsx prisma/seed-studio.ts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
