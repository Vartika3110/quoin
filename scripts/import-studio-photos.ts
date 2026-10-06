/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { StudioRoom } from "@prisma/client";

/**
 * Bring the owner's own interiors into Studio.
 *
 *   npx tsx scripts/import-studio-photos.ts <source-dir>
 *   npx tsx prisma/seed-studio.ts
 *
 * Studio has been rendering an empty wall since it shipped. Not through a
 * fault: `imageUrlFor` returns null for any pin whose `assetPath` is not
 * under `/studio/`, and all fourteen seeded pins borrow the catalogue's
 * *department* artwork from `/categories/`. That rule is deliberate and
 * it is right — a tray of door handles captioned "Bathroom fittings, laid
 * out" teaches a first-time visitor that Studio is the shop again. The
 * wall was waiting for rooms.
 *
 * This is the sibling of `scripts/generate-studio-images.ts`. That one
 * buys rooms from an image model and costs money per run; this one takes
 * rooms the owner already has. They write the identical artefacts —
 * `public/studio/<slug>.webp` plus an entry in `manifest.json` — because
 * `prisma/seed-studio.ts` reads the manifest and does not care which of
 * the two filled it. Filling it is also the switch that demotes the
 * fourteen departments out of the discovery feed; see the note on `kind`
 * in that file.
 *
 * ## Screening, and why it is a table in the source
 *
 * The handoff is emphatic on this point and it was right to be: of the
 * thirty-nine images supplied, six carry somebody else's mark. Filenames
 * prove nothing — previously rejected images came back repeatedly under
 * fresh `Gemini_Generated_Image_*` names, so every frame here was opened
 * and looked at, corners included, rather than trusted.
 *
 * The verdicts live in `REJECTED` below rather than in a commit message
 * because the next person handed a folder of interiors needs to know
 * which ones already failed and on what grounds. An image that is merely
 * absent from this script looks like an oversight; one listed with its
 * watermark named cannot be re-admitted by accident.
 *
 * ## What these pictures are
 *
 * They are AI-generated visualisations, not photographs of rooms anybody
 * built. Every entry this script writes is marked `imageIsGenerated`,
 * the same claim `Product.imageIsGenerated` makes, and the storefront
 * labels the tile and the detail page from it.
 *
 * On top of that, no pin here claims a designer, a location, or a bill of
 * materials, because all three would be invented. See `seedRooms` in the
 * seed for the same argument about hotspots.
 */

/* ---- Screening verdicts -------------------------------------------- */

/**
 * Supplied images that must not reach the site, and the reason each one
 * failed. Keyed on filename only so a re-supply under a new name is
 * caught by the eye, not by this list — the point of the note is the
 * ground, not the key.
 */
const REJECTED: Record<string, string> = {
  "Gemini_Generated_Image_lsb270lsb270lsb2.png":
    "Carried “© D'LIFE Home Interiors. All rights reserved.” along the lower edge — croppable — but also “ACTUAL PHOTOGRAPH” set into the middle-left of the frame, over the glazing. That one is not at an edge: removing it means cutting away about a third of the picture, which leaves no composition worth publishing. Of the six marked images this is the only one a crop cannot save.",
  "br-11-12-1777271766-013i8.avif":
    "The same sage bathroom as y9bnib, re-supplied as an .avif under a CDN-style filename. Provenance unclear, and as a duplicate of a frame already in the wall there is nothing lost by leaving it out.",
};

/* ---- The approved thirty-three ------------------------------------- */

interface Photo {
  /** Source filename, exactly as supplied. */
  file: string;
  /** Becomes the filename under `public/studio/` and the manifest key. */
  slug: string;
  title: string;
  description: string;
  room: StudioRoom;
  styles: string[];
  /** Matched by "Shop this look" against the catalogue, so these are
      material names the catalogue actually stocks, never adjectives. */
  materials: string[];
  colors: { hex: string; name: string }[];
  /**
   * Fraction of the height to cut off the top and/or bottom before
   * encoding, to remove a watermark the generator drew into the frame.
   *
   * Four of the supplied images carry another company's mark — BLOOM
   * STUDIO, BODAQ.COM, LANDMARKS ARCHITECTS, LAKKADWORKS — reproduced by
   * the image model because it learned them from the work it was trained
   * on. The mark is still that company's name, so the frame cannot ship
   * with it. In each of these four it sits in a band at one edge, and
   * cropping the band leaves the room intact.
   *
   * This is the handoff's own practice, held: branded AI output was used
   * before by taking only the unbranded region. It is not a general
   * licence to crop a mark out of somebody's photograph — these are
   * generated frames, and what is being removed is a label the generator
   * hallucinated onto them, not a credit anyone attached.
   *
   * The values were set by cropping and then looking at the result, not
   * by arithmetic. Re-derive them the same way if a source is replaced.
   */
  crop?: { top?: number; bottom?: number };
}

const PHOTOS: Photo[] = [
  {
    file: "ChatGPT Image Sep 15, 2026, 12_00_54 PM.png",
    slug: "marble-headboard-wall-bedroom",
    title: "Book-matched marble behind the bed",
    description:
      "A single slab of veined marble run the full width of the wall, lit from below by slim brass pendants.",
    room: "BEDROOM",
    styles: ["luxe", "contemporary"],
    materials: ["marble", "brass", "laminate"],
    colors: [{ hex: "#e7ded0", name: "Cream marble" }, { hex: "#b08b45", name: "Antique brass" }],
  },
  {
    file: "ChatGPT Image Sep 15, 2026, 12_02_32 PM.png",
    slug: "terracotta-carved-teak-bedroom",
    title: "Carved teak bed in a terracotta room",
    description:
      "Deep terracotta walls with a carved teak bed and matching wardrobe shutters — traditional joinery, modern lighting.",
    room: "BEDROOM",
    styles: ["traditional", "warm"],
    materials: ["teak", "plywood", "emulsion"],
    colors: [{ hex: "#b5643c", name: "Terracotta" }, { hex: "#5a3821", name: "Teak" }],
  },
  {
    file: "ChatGPT Image Sep 15, 2026, 12_09_48 PM.png",
    slug: "statuario-bath-floating-vanity",
    title: "Statuario bath with a floating stone vanity",
    description:
      "Large-format marble on every surface, with a dark stone counter floating clear of the floor and a wall-hung WC.",
    room: "BATHROOM",
    styles: ["modern", "luxe"],
    materials: ["marble", "ceramic", "brass"],
    colors: [{ hex: "#efece6", name: "Statuario" }, { hex: "#4a4541", name: "Dark stone" }],
  },
  {
    file: "ChatGPT Image Sep 16, 2026, 10_47_51 PM.png",
    slug: "terracotta-gloss-patterned-floor-bath",
    title: "Gloss terracotta tile over a patterned floor",
    description:
      "Glazed terracotta run floor to ceiling, set against an encaustic-pattern floor and a timber vanity.",
    room: "BATHROOM",
    styles: ["eclectic", "warm"],
    materials: ["ceramic", "vitrified tile", "plywood"],
    colors: [{ hex: "#c0623a", name: "Glazed terracotta" }, { hex: "#2f4858", name: "Slate blue" }],
  },
  {
    file: "ChatGPT Image Sep 16, 2026, 10_48_00 PM.png",
    slug: "rajasthani-jewel-panelling-bedroom",
    title: "Jewel-toned Rajasthani panelling",
    description:
      "Painted and mirrored wall panels in emerald, saffron and vermilion, framing a carved headboard.",
    room: "BEDROOM",
    styles: ["traditional", "eclectic"],
    materials: ["plywood", "emulsion", "teak"],
    colors: [{ hex: "#1f6b4f", name: "Emerald" }, { hex: "#c3392c", name: "Vermilion" }],
  },
  {
    file: "ChatGPT Image Sep 16, 2026, 10_48_09 PM.png",
    slug: "teal-wave-headboard-bedroom",
    title: "Sculptural wave headboard in teal and brass",
    description:
      "A moulded headboard in teal velvet and brass, set against slate panelling and a figured marble floor.",
    room: "BEDROOM",
    styles: ["luxe", "contemporary"],
    materials: ["marble", "brass", "laminate"],
    colors: [{ hex: "#155e6b", name: "Deep teal" }, { hex: "#c9a227", name: "Brass" }],
  },
  {
    file: "Gemini_Generated_Image_3aypkh3aypkh3ayp.png",
    slug: "twin-chandeliers-tufted-bed",
    title: "Twin chandeliers over a tufted bed",
    description:
      "A pair of crystal rings above a buttoned bed, with patterned stone panels running the height of the wall.",
    room: "BEDROOM",
    styles: ["luxe", "classical"],
    materials: ["marble", "brass", "laminate"],
    colors: [{ hex: "#cfc6b8", name: "Pale stone" }, { hex: "#7d2235", name: "Claret" }],
    crop: { bottom: 0.16 },
  },
  {
    file: "Gemini_Generated_Image_5t7evi5t7evi5t7e.png",
    slug: "haveli-bedroom-carved-headboard",
    title: "Carved headboard in a haveli bedroom",
    description:
      "An antique carved headboard against deep red walls, with fretworked balcony doors throwing late light across the floor.",
    room: "BEDROOM",
    styles: ["traditional", "warm"],
    materials: ["teak", "marble", "emulsion"],
    colors: [{ hex: "#9c3326", name: "Haveli red" }, { hex: "#c8a46a", name: "Aged gold" }],
    crop: { top: 0.22 },
  },
  {
    file: "Gemini_Generated_Image_cc2tb0cc2tb0cc2t.png",
    slug: "living-wall-warehouse-office",
    title: "A living wall in a warehouse office",
    description:
      "A planted wall splitting a long open floor, under a slatted timber ceiling and full-height factory glazing.",
    room: "HOME_OFFICE",
    styles: ["industrial", "contemporary"],
    materials: ["steel", "plywood", "vitrified tile"],
    colors: [{ hex: "#4a663a", name: "Planted green" }, { hex: "#8c8781", name: "Concrete" }],
    crop: { bottom: 0.16 },
  },
  {
    file: "Gemini_Generated_Image_e4sfgye4sfgye4sf.png",
    slug: "gilded-panel-bedroom-wardrobe",
    title: "Gilded panel bedroom with a walk-in wardrobe",
    description:
      "A gold-leaf tree panel behind the bed, with a lit walk-in wardrobe open along one wall and a fluted drum pendant above.",
    room: "BEDROOM",
    styles: ["luxe", "contemporary"],
    materials: ["plywood", "brass", "marble"],
    colors: [{ hex: "#c9a227", name: "Gold leaf" }, { hex: "#6b4a2f", name: "Walnut" }],
    crop: { bottom: 0.18 },
  },
  {
    file: "Gemini_Generated_Image_3m84123m84123m84.png",
    slug: "tapestry-wall-classical-living",
    title: "Tapestry wall over a classical seating group",
    description:
      "A hung tapestry centred on a plaster wall, with a pair of carved sofas and a marble-topped low table.",
    room: "LIVING_ROOM",
    styles: ["classical", "traditional"],
    materials: ["marble", "teak", "emulsion"],
    colors: [{ hex: "#7d2235", name: "Claret" }, { hex: "#d8cbb4", name: "Warm plaster" }],
  },
  {
    file: "Gemini_Generated_Image_3yi0gt3yi0gt3yi0.png",
    slug: "brass-disc-chandelier-bedroom",
    title: "Brass disc chandelier over a gold-panelled headboard",
    description:
      "A scattered-disc brass fitting above a padded headboard, with antiqued gold leaf panels behind.",
    room: "BEDROOM",
    styles: ["luxe", "contemporary"],
    materials: ["brass", "plywood", "laminate"],
    colors: [{ hex: "#b08b45", name: "Antique gold" }, { hex: "#7d1f36", name: "Oxblood" }],
  },
  {
    file: "Gemini_Generated_Image_6h02id6h02id6h02.png",
    slug: "perforated-copper-open-office",
    title: "Open-plan office behind a perforated copper wall",
    description:
      "A floor of desks broken by a single perforated copper screen, keeping the plan bright without losing definition.",
    room: "HOME_OFFICE",
    styles: ["industrial", "contemporary"],
    materials: ["copper", "steel", "vitrified tile"],
    colors: [{ hex: "#9c5a33", name: "Copper" }, { hex: "#b8b3ab", name: "Raw brick" }],
  },
  {
    file: "Gemini_Generated_Image_bgsz0ibgsz0ibgsz.png",
    slug: "arched-niches-carved-daybed",
    title: "Arched niches and a carved daybed",
    description:
      "Shallow arched niches in soft plaster, with a carved timber daybed and brass collectibles on open shelves.",
    room: "LIVING_ROOM",
    styles: ["traditional", "minimal"],
    materials: ["teak", "brass", "emulsion"],
    colors: [{ hex: "#e4ddd0", name: "Chalk plaster" }, { hex: "#6b4524", name: "Rosewood" }],
  },
  {
    file: "Gemini_Generated_Image_bquzerbquzerbquz.png",
    slug: "double-height-dark-stone-living",
    title: "Double-height living room in dark stone",
    description:
      "A floating stair against a dark stone wall, with a sunken seating well and concealed cove lighting throughout.",
    room: "LIVING_ROOM",
    styles: ["modern", "luxe"],
    materials: ["granite", "marble", "steel"],
    colors: [{ hex: "#2b2724", name: "Charcoal stone" }, { hex: "#c9a227", name: "Warm gold" }],
  },
  {
    file: "Gemini_Generated_Image_ch4d0ach4d0ach4d.png",
    slug: "backlit-round-mirror-travertine-bath",
    title: "Backlit round mirror over a travertine vanity",
    description:
      "A lit circular mirror on a travertine wall, with an oak vanity, a freestanding tub and a walk-in shower beyond.",
    room: "BATHROOM",
    styles: ["warm", "minimal"],
    materials: ["travertine", "ceramic", "brass"],
    colors: [{ hex: "#e3d6c0", name: "Travertine" }, { hex: "#b5853f", name: "Warm brass" }],
  },
  {
    file: "Gemini_Generated_Image_dvo2bddvo2bddvo2.png",
    slug: "scalloped-arch-headboard-navy",
    title: "Scalloped arch headboard in navy",
    description:
      "A Moroccan-arch headboard quilted in navy, under a moulded ceiling and a pair of glass pendants.",
    room: "BEDROOM",
    styles: ["classical", "eclectic"],
    materials: ["plywood", "emulsion", "brass"],
    colors: [{ hex: "#1e3a5f", name: "Navy" }, { hex: "#efe9dd", name: "Ivory moulding" }],
  },
  {
    file: "Gemini_Generated_Image_fxfnjcfxfnjcfxfn.png",
    slug: "pendant-lit-open-desks-office",
    title: "An open floor of desks under pendant lighting",
    description:
      "Curved workstations and task chairs under exposed services, with a garden visible the length of one wall.",
    room: "HOME_OFFICE",
    styles: ["industrial", "contemporary"],
    materials: ["steel", "laminate", "vitrified tile"],
    colors: [{ hex: "#c2724a", name: "Burnt orange" }, { hex: "#8e9a92", name: "Sage grey" }],
  },
  {
    file: "Gemini_Generated_Image_httoxyhttoxyhtto.png",
    slug: "gloss-grey-marble-splashback-kitchen",
    title: "High-gloss grey kitchen with a marble splashback",
    description:
      "Handleless gloss shutters either side of a galley, with the marble splashback carried to the ceiling.",
    room: "KITCHEN",
    styles: ["modern", "minimal"],
    materials: ["marble", "laminate", "steel"],
    colors: [{ hex: "#b9bcc0", name: "Gloss grey" }, { hex: "#efece6", name: "White marble" }],
  },
  {
    file: "Gemini_Generated_Image_hyigz3hyigz3hyig.png",
    slug: "carved-arches-terracotta-bedroom",
    title: "Carved arches and terracotta walls",
    description:
      "A jharokha-style arched window wall in carved timber, with terracotta plaster and a brass lantern.",
    room: "BEDROOM",
    styles: ["traditional", "warm"],
    materials: ["teak", "brass", "emulsion"],
    colors: [{ hex: "#c06a3a", name: "Terracotta" }, { hex: "#8a5a2b", name: "Carved teak" }],
  },
  {
    file: "Gemini_Generated_Image_iki4tfiki4tfiki4.png",
    slug: "bronze-cranes-plaster-wall",
    title: "Bronze cranes on a plaster wall",
    description:
      "A flight of bronze cranes across raw plaster, with a travertine console and fluted timber beyond.",
    room: "LIVING_ROOM",
    styles: ["minimal", "warm"],
    materials: ["travertine", "brass", "plywood"],
    colors: [{ hex: "#ded5c6", name: "Raw plaster" }, { hex: "#8c6239", name: "Bronze" }],
  },
  {
    file: "Gemini_Generated_Image_j11eg6j11eg6j11e.png",
    slug: "two-tone-walnut-graphite-kitchen",
    title: "Two-tone kitchen in walnut and graphite",
    description:
      "Walnut bases under graphite uppers, with a dark stone counter and a lit open shelf for glassware.",
    room: "KITCHEN",
    styles: ["contemporary", "warm"],
    materials: ["granite", "laminate", "steel"],
    colors: [{ hex: "#6b4a2f", name: "Walnut" }, { hex: "#3c3f42", name: "Graphite" }],
  },
  {
    file: "Gemini_Generated_Image_kpy4ftkpy4ftkpy4.png",
    slug: "double-height-evening-living",
    title: "Double-height living room, lit for the evening",
    description:
      "A timber-lined ceiling raking up over a low seating group, with stone cladding and the garden lit beyond the glass.",
    room: "LIVING_ROOM",
    styles: ["modern", "luxe"],
    materials: ["granite", "teak", "vitrified tile"],
    colors: [{ hex: "#2f2a26", name: "Night charcoal" }, { hex: "#a8814e", name: "Lit timber" }],
  },
  {
    file: "Gemini_Generated_Image_oafrkyoafrkyoafr.png",
    slug: "peacock-mural-bedroom",
    title: "Hand-painted peacock mural behind the bed",
    description:
      "A full-wall mural of peacocks and palace architecture, kept calm by grey bedding and a plain rug.",
    room: "BEDROOM",
    styles: ["eclectic", "traditional"],
    materials: ["emulsion", "plywood"],
    colors: [{ hex: "#2e7d6b", name: "Peacock green" }, { hex: "#e9e4da", name: "Chalk" }],
  },
  {
    file: "Gemini_Generated_Image_q3b97oq3b97oq3b9.png",
    slug: "sage-and-pink-tile-bath",
    title: "Sage and dusty pink tile with brass fittings",
    description:
      "Two tile colours divided down the room, with a cane vanity, a round mirror and unlacquered brass.",
    room: "BATHROOM",
    styles: ["warm", "eclectic"],
    materials: ["ceramic", "brass", "plywood"],
    colors: [{ hex: "#8ea894", name: "Sage" }, { hex: "#e0b4ae", name: "Dusty pink" }],
  },
  {
    file: "Gemini_Generated_Image_rgg9a8rgg9a8rgg9.png",
    slug: "arc-lamp-pale-blue-living",
    title: "Arc lamp over a pale blue seating group",
    description:
      "A steel arc lamp swung over pale blue upholstery, against warm lime-plaster walls and a dark tiled floor.",
    room: "LIVING_ROOM",
    styles: ["contemporary", "minimal"],
    materials: ["vitrified tile", "steel", "emulsion"],
    colors: [{ hex: "#a8bdd1", name: "Powder blue" }, { hex: "#c9b58d", name: "Lime plaster" }],
  },
  {
    file: "Gemini_Generated_Image_rviq0yrviq0yrviq.png",
    slug: "oxblood-lacquer-galley-kitchen",
    title: "Oxblood lacquer galley kitchen",
    description:
      "High-lacquer red shutters against book-matched marble, with a brass rail and a vintage radio in the niche.",
    room: "KITCHEN",
    styles: ["eclectic", "luxe"],
    materials: ["marble", "laminate", "brass"],
    colors: [{ hex: "#8e2b23", name: "Oxblood lacquer" }, { hex: "#e8e4dd", name: "Book-matched marble" }],
  },
  {
    file: "Gemini_Generated_Image_ry2xxcry2xxcry2x.png",
    slug: "carved-swing-painted-panels-living",
    title: "A carved swing and painted wall panels",
    description:
      "A traditional jhoola in carved timber, with painted panels, a tiled low table and brass accents.",
    room: "LIVING_ROOM",
    styles: ["traditional", "eclectic"],
    materials: ["teak", "ceramic", "brass"],
    colors: [{ hex: "#9b2c3f", name: "Maroon" }, { hex: "#7a4b28", name: "Carved teak" }],
  },
  {
    file: "Gemini_Generated_Image_u16sbfu16sbfu16s.png",
    slug: "platform-bed-glass-dressing-room",
    title: "Platform bed beside a glass-walled dressing room",
    description:
      "A stepped platform bed with a lit glass wardrobe alongside, under a fluted charcoal ceiling.",
    room: "BEDROOM",
    styles: ["modern", "luxe"],
    materials: ["plywood", "steel", "laminate"],
    colors: [{ hex: "#3a3732", name: "Fluted charcoal" }, { hex: "#a97f4f", name: "Oak" }],
  },
  {
    file: "Gemini_Generated_Image_u3k35pu3k35pu3k3.png",
    slug: "timber-panelled-garden-bedroom",
    title: "Timber-panelled bedroom opening to the garden",
    description:
      "Full-height timber panelling and a sliding glass wall, with a woven rug and a low upholstered bed.",
    room: "BEDROOM",
    styles: ["warm", "contemporary"],
    materials: ["teak", "plywood", "vitrified tile"],
    colors: [{ hex: "#7a5533", name: "Warm timber" }, { hex: "#cfc3ad", name: "Woven jute" }],
  },
  {
    file: "Gemini_Generated_Image_utrdliutrdliutrd.png",
    slug: "coffered-ceiling-skyline-living",
    title: "Coffered ceiling over a skyline living room",
    description:
      "A coffered timber ceiling framing a wall of glass, with a long sectional on polished marble.",
    room: "LIVING_ROOM",
    styles: ["luxe", "classical"],
    materials: ["marble", "teak", "brass"],
    colors: [{ hex: "#efece6", name: "Polished marble" }, { hex: "#6b4a2f", name: "Coffered timber" }],
  },
  {
    file: "Gemini_Generated_Image_wgr821wgr821wgr8.png",
    slug: "black-gold-marble-sunburst-bath",
    title: "Black and gold marble with sunburst mirrors",
    description:
      "Gold-veined black marble on every surface, with a pair of sunburst mirrors over a dark vanity.",
    room: "BATHROOM",
    styles: ["luxe", "classical"],
    materials: ["marble", "brass", "ceramic"],
    colors: [{ hex: "#171716", name: "Nero marble" }, { hex: "#c9a227", name: "Gold vein" }],
  },
  {
    file: "Gemini_Generated_Image_wjh88hwjh88hwjh8.png",
    slug: "fluted-headboard-neutral-bedroom",
    title: "Fluted headboard in a soft neutral bedroom",
    description:
      "A tall fluted headboard in oatmeal linen, with slim brass pendants and a patterned rug underfoot.",
    room: "BEDROOM",
    styles: ["minimal", "warm"],
    materials: ["plywood", "brass", "emulsion"],
    colors: [{ hex: "#d9cbb4", name: "Oatmeal" }, { hex: "#b08b45", name: "Brass" }],
  },
  {
    file: "Gemini_Generated_Image_y03b9y03b9y03b9y.png",
    slug: "olive-tufted-bed-timber-panelling",
    title: "Olive channel-tufted bed against timber panelling",
    description:
      "Channel-tufted olive velvet on a slatted timber wall, with a drum pendant and a patterned wool rug.",
    room: "BEDROOM",
    styles: ["contemporary", "warm"],
    materials: ["plywood", "brass", "laminate"],
    colors: [{ hex: "#6b7042", name: "Olive" }, { hex: "#8a6240", name: "Slatted timber" }],
  },
  {
    file: "Gemini_Generated_Image_y9bniby9bniby9bn.png",
    slug: "sage-tile-terrazzo-compact-bath",
    title: "Sage tile and terrazzo in a compact bath",
    description:
      "Sage tile to the ceiling over a terrazzo floor, with aged brass fittings and a trailing plant.",
    room: "BATHROOM",
    styles: ["warm", "minimal"],
    materials: ["ceramic", "terrazzo", "brass"],
    colors: [{ hex: "#9aad96", name: "Sage" }, { hex: "#e6e3d8", name: "Terrazzo" }],
  },
  {
    file: "Gemini_Generated_Image_z1cc0fz1cc0fz1cc.png",
    slug: "fluted-oak-travertine-study",
    title: "Fluted oak study with a travertine desk",
    description:
      "A fluted oak wall of shelving behind a travertine-legged desk, lit from a full-height window.",
    room: "HOME_OFFICE",
    styles: ["minimal", "warm"],
    materials: ["travertine", "plywood", "vitrified tile"],
    colors: [{ hex: "#d7c9ae", name: "Oak" }, { hex: "#e8e3d6", name: "Travertine" }],
  },
  {
    file: "Gemini_Generated_Image_zgezbfzgezbfzgez.png",
    slug: "terracotta-herringbone-shower",
    title: "Terracotta herringbone shower",
    description:
      "Glazed terracotta laid in herringbone around a glass shower, with an oak vanity and a stone basin.",
    room: "BATHROOM",
    styles: ["warm", "contemporary"],
    materials: ["ceramic", "plywood", "brass"],
    colors: [{ hex: "#a9492c", name: "Glazed terracotta" }, { hex: "#cdb89a", name: "Oak" }],
  },
  /* ---- Added 5 Oct 2026 ---------------------------------------------
     Screened the way the rest were: both opened at full size, corners
     included. No third-party mark in either. The sparkle at the lower
     right of the still is the generator's own, as in the other frames
     from the same tool. The clip's frames were checked at 0.1, 2.5, 5,
     7.5 and 9.8 seconds. */
  {
    file: "Gemini_Generated_Image_wg3ekwwg3ekwwg3e.png",
    slug: "rose-headboard-walnut-stone-bedroom",
    title: "Rose headboard against walnut and stone",
    description:
      "A dusty-rose channel headboard set against walnut panelling, with a rough-cut stone band above and a brass starburst pendant overhead.",
    room: "BEDROOM",
    styles: ["luxe", "contemporary"],
    materials: ["plywood", "laminate", "brass"],
    colors: [
      { hex: "#b88a86", name: "Dusty rose" },
      { hex: "#4f3724", name: "Walnut" },
      { hex: "#cea267", name: "Antique brass" },
    ],
  },
  {
    /* The still for the pin that carries a clip. It is the first frame of
       premium_luxury_bedroom_walkthrough_10sec.mp4, taken with
         ffmpeg -ss 0.1 -i <clip> -frames:v 1 <this file>
       The clip itself ships as public/studio/skyline-bedroom-golden-hour.mp4
       and is attached to the seeded pin with `npm run studio:clip` — see
       docs/studio-video.md. */
    file: "premium_luxury_bedroom_walkthrough_10sec__poster.png",
    slug: "skyline-bedroom-golden-hour",
    title: "A skyline bedroom at golden hour",
    description:
      "Layered neutrals, a dark runner across the bed and a floor-to-ceiling view over the city at dusk.",
    room: "BEDROOM",
    styles: ["luxe", "contemporary"],
    materials: ["laminate", "brass"],
    colors: [
      { hex: "#4a321b", name: "Espresso" },
      { hex: "#936d4b", name: "Caramel taupe" },
      { hex: "#e3cfba", name: "Pale sand" },
    ],
  },
];

/* ---- Encoding ------------------------------------------------------ */

const OUT_DIR = path.join("public", "studio");
const MANIFEST = path.join(OUT_DIR, "manifest.json");

/** The wall is a column of these on a phone; full-resolution PNGs at
    8–10 MB each are not a page, they are a download. */
const MAX_EDGE = 1600;

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
  /** Always true here: everything this script imports came out of an
      image model. See `StudioIdea.imageIsGenerated`. */
  imageIsGenerated: boolean;
}

async function readManifest(): Promise<Record<string, ManifestEntry>> {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8")) as Record<string, ManifestEntry>;
  } catch {
    return {};
  }
}

async function main() {
  const source = process.argv[2];
  if (!source || !existsSync(source)) {
    console.error("usage: npx tsx scripts/import-studio-photos.ts <source-dir>");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const manifest = await readManifest();

  /* Anything in the folder that is neither approved nor explicitly
     rejected is new since the screening, and must not be let through on
     the strength of sitting in the same directory. */
  const known = new Set([...PHOTOS.map((p) => p.file), ...Object.keys(REJECTED)]);
  const present = readdirSync(source).filter((f) => /\.(png|jpe?g|avif|webp)$/i.test(f));
  const unscreened = present.filter((f) => !known.has(f));

  let written = 0;
  for (const photo of PHOTOS) {
    const src = path.join(source, photo.file);
    if (!existsSync(src)) {
      console.error(`✗ ${photo.slug}: source missing — ${photo.file}`);
      continue;
    }

    /* Crop before resize, so the fractions are of the original frame and
       stay correct if MAX_EDGE ever changes. */
    let pipeline = sharp(src);
    if (photo.crop) {
      const meta = await sharp(src).metadata();
      const height = meta.height ?? 0;
      const width = meta.width ?? 0;
      const top = Math.round(height * (photo.crop.top ?? 0));
      const bottom = Math.round(height * (photo.crop.bottom ?? 0));
      pipeline = pipeline.extract({
        left: 0,
        top,
        width,
        height: height - top - bottom,
      });
    }

    const encoded = await pipeline
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const file = `${photo.slug}.webp`;
    await writeFile(path.join(OUT_DIR, file), encoded);

    const meta = await sharp(encoded).metadata();
    /* The masonry needs the ratio before the bytes arrive, and the blur is
       what it shows meanwhile — both recorded now so seeding never
       re-opens the file. */
    const blur = await sharp(encoded).resize(16).webp({ quality: 40 }).toBuffer();

    manifest[photo.slug] = {
      assetPath: `/studio/${file}`,
      title: photo.title,
      description: photo.description,
      room: photo.room,
      styles: photo.styles,
      materials: photo.materials,
      colors: photo.colors,
      width: meta.width ?? MAX_EDGE,
      height: meta.height ?? MAX_EDGE,
      blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
      imageIsGenerated: true,
    };

    written += 1;
    console.log(`✓ ${photo.slug}  ${meta.width}×${meta.height}  ${Math.round(encoded.length / 1024)} KB`);
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\n[studio] ${written} rooms written to ${OUT_DIR}`);
  console.log(`[studio] ${Object.keys(REJECTED).length} supplied images rejected:`);
  for (const [file, why] of Object.entries(REJECTED)) {
    console.log(`         - ${file}\n           ${why}`);
  }
  if (unscreened.length) {
    console.log(
      `\n[studio] ${unscreened.length} file(s) in the source folder are neither ` +
        `approved nor rejected. They were NOT imported — open them and add a verdict:`,
    );
    for (const f of unscreened) console.log(`         - ${f}`);
  }
  console.log(`\nNext: npx tsx prisma/seed-studio.ts`);
}

main();
