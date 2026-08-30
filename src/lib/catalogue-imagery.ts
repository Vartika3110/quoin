/**
 * Photographs borrowed from the catalogue to illustrate navigation.
 *
 * The entry tiles and the tab rail used to carry line icons. An icon of a
 * hard hat says "services" the way a road sign does — legibly, and without
 * showing anyone what Quoin actually sells. These are real photographs of
 * real rows in the catalogue, already shipped under `public/catalogue/`
 * (see the "Ship the catalogue photographs with the app" commit), so the
 * storefront's front door is made of its own stock rather than clip art.
 *
 * `src` points at `public/nav/`, not at the catalogue file itself. Those
 * are square thumbnails cut from these photographs by
 * `npm run images:nav`, which trims the field of white each one is shot
 * against so the subject fills the circle it is drawn in rather than
 * floating at a third of the width with background all around it. The
 * script explains why that is done there and not with a CSS zoom.
 *
 * Every source was chosen against three rules, in this order:
 *
 *  1. **No third-party wordmark.** A cement sack reading ULTRATECH or a
 *     drill reading MAKITA turns a category tile into an endorsement
 *     nobody signed. The catalogue is full of otherwise-excellent shots
 *     that fail on this alone — that is why there is no paint tin here,
 *     and no power tool, though both are the obvious picture.
 *  2. **Survives a centre crop to a square.** The thumbnail is squared
 *     after trimming, so anything whose subject is extremely long in one
 *     axis loses its ends.
 *  3. **Reads against a white card.** The white-on-white ceramics photo
 *     beautifully and then disappear on the page.
 *
 * Reuse between the two maps is deliberate, not an oversight: a 64px
 * circle in the tab rail reads as colour and texture, not as a recognised
 * object, so the eye never pairs it with the tile above it.
 *
 * These are decorative — every one sits beside a text label that already
 * names the destination — so both call sites render them with `alt=""`
 * rather than repeating that label to a screen reader.
 */

export interface NavPhoto {
  /** Path under `public/`. */
  src: string;
  /** What it is a photograph of. Documentation, never rendered. */
  subject: string;
}

/* Shared between the tiles and the rail, so a file that turns out to be
   wrong is replaced in one place rather than two. */
const WOOD_LAMINATE: NavPhoto = {
  src: "/nav/wood-laminate.webp",
  subject: "Oak-toned laminate sheet, full-frame grain",
};

/**
 * Stands in for the trades.
 *
 * Nothing in the catalogue is a photograph of a person working, so the
 * services tile has to be represented by something an expert installs.
 * This one earns the slot on contrast as much as meaning: it is the only
 * near-unbranded shot in the set that is genuinely dark, which is what
 * makes it legible at 64px on a white card. A chrome tap set was tried
 * first: even trimmed to its subject it is five pale slivers with gaps
 * between them, and at this size the gaps win.
 */
const DOOR_HARDWARE: NavPhoto = {
  src: "/nav/door-hardware.webp",
  subject: "Matte black digital door lock, handle set",
};

const STEEL_BARS: NavPhoto = {
  src: "/nav/steel-bars.webp",
  subject: "Bundle of TMT reinforcement bars",
};

const SHOWER_HEAD: NavPhoto = {
  src: "/nav/shower-head.webp",
  subject: "Round chrome overhead shower",
};

const QUARTZ_SINK: NavPhoto = {
  src: "/nav/quartz-sink.webp",
  subject: "Charcoal quartz single-bowl kitchen sink",
};

const DOWNLIGHT: NavPhoto = {
  src: "/nav/downlight.webp",
  subject: "Recessed LED spot light",
};

/**
 * The four entry tiles, keyed by the destination each one links to.
 *
 * Keyed by `href` rather than by position so reordering the tiles cannot
 * silently hand "Professional Services" the picture of a steel bundle.
 */
export const ENTRY_PHOTOS: Record<string, NavPhoto> = {
  "/studio": WOOD_LAMINATE,
  "/c/services": DOOR_HARDWARE,
  "/products": STEEL_BARS,
  "/products?sort=price": SHOWER_HEAD,
};

/**
 * The tab rail, keyed by `CatalogTab.id`.
 *
 * `all` gets the laminate: it is the warmest and least specific of the
 * six, which is the closest a photograph gets to meaning "everything".
 */
export const TAB_PHOTOS: Record<string, NavPhoto> = {
  all: WOOD_LAMINATE,
  services: DOOR_HARDWARE,
  materials: STEEL_BARS,
  premium: SHOWER_HEAD,
  interiors: QUARTZ_SINK,
  lighting: DOWNLIGHT,
};
