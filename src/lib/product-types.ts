/**
 * Sub-categories, as a filter over what the product is actually called.
 *
 * A department of 163 taps, pipes, cisterns and towel rails is not a
 * shelf anybody can browse. The design reference answers that with a
 * second chip row under the department row — *Showers & fittings*, *Taps
 * & mixers*, *Health faucets* — and until now there was nothing behind
 * it: `Category.parentId` is null on every row in the catalogue, because
 * the import files a flat list (`docs/django-to-prisma.md`). The "Type"
 * chip was omitted for exactly that reason; see `FilterChipRow`.
 *
 * So the grouping is derived from the one piece of real data every row
 * has — its name. Each type is a set of terms matched case-insensitively
 * against `Product.name`, and the groups are **ordered**: a product is
 * filed under the first type it matches, so `Jaquar Aquamax Exposed Part
 * Kit of Single Lever Shower Mixer` is a shower rather than a mixer
 * because *Showers* is declared above *Taps & mixers*. That ordering is
 * the whole mechanism for overlap: there are no exclusion lists to keep
 * in step with the match lists, because the exclusions *are* the match
 * lists of everything declared above.
 *
 * What this is **not**: an attribute table. It cannot answer "48mm" or
 * "brushed brass", and it never will — those arrive when the catalogue
 * carries attributes. It answers the one question a department page
 * cannot answer without it: *which shelf of this department*.
 *
 * Three rules this file is held to, because the counts are shown to a
 * customer and acted on:
 *
 *  - **Terms are substrings, so short ones are traps.** `tap` is inside
 *    `Tape`, `led` is inside `Bundled`, `ply` is inside `Greenply`.
 *    Anything under four characters carries a neighbouring space or
 *    comma — `" led"`, `"cob "`, `"wc,"` — unless it is one of the
 *    acronyms below, which cannot occur inside an English word.
 *  - **A type that matches nothing is not rendered.** The counts come
 *    from the same query the grid runs, so a chip never lands on an empty
 *    page; see `getProductFacets`.
 *  - **Departments with no honest grouping get none.** Four products, or
 *    fourteen that are all the same thing, are a list, not a taxonomy.
 *    `kitchen-sinks-faucets` and `gypsum-false-ceiling` are deliberately
 *    absent.
 *
 * The day merchandising files real children under a department, this
 * becomes the fallback for the ones they have not reached yet, and the
 * chip row reads from `Category.children` instead. Nothing above the
 * data layer has to change: the URL is `?type=showers` either way.
 */

/**
 * Short terms that are safe to leave unanchored.
 *
 * Every one is a trade code that does not occur inside an English word
 * or a brand name — `MCB`, `TMT`, `BWP`. The anchoring rule exists
 * because `tap` is inside `Tape`; it would be noise applied to these,
 * and `MDF` in particular is a product name entire, with no space
 * either side of it to anchor against.
 *
 * Exported because `tests/product-types.test.mts` enforces the rule, and
 * the exception belongs beside the thing it excepts rather than in the
 * test.
 */
export const WORD_SAFE_ACRONYMS = new Set([
  "mcb",
  "nca",
  "nsa",
  "vfa",
  "mdf",
  "bwp",
  "tmt",
  "sbr",
]);

export interface ProductType {
  /** The `?type=` value. Stable — it is in shared links. */
  id: string;
  /** The chip. */
  label: string;
  /** Any of these in the name files a product here. */
  match: string[];
  /**
   * Which product should supply the shelf's picture, as terms tried in
   * order.
   *
   * Without this the thumbnail is simply the first product in the shelf
   * by name, and "first alphabetically" is not "typical": *Fans* opened
   * on an `Anchor Roma Fan Regulator`, *Geysers & heaters* on a bare
   * heating `Element`, *Pipes & fittings* on an `Ashirvad 3 Layer
   * Overhead Tank`. Each is genuinely in its shelf and none of them
   * looks like it, which is the whole job of an 56px picture next to a
   * two-word label.
   *
   * Only set where the default picks badly. It is a hint, not a
   * requirement: a term that matches nothing sellable falls through to
   * the next, and then to the default, so this can never empty a
   * thumbnail — and the shelf keeps working if the product behind it is
   * withdrawn.
   */
  thumbnail?: string[];
}

/**
 * Keyed by department slug, most specific type first.
 *
 * Order is load-bearing — see the note above. Moving a type up or down
 * this list re-files products, so it is a merchandising decision rather
 * than a formatting one.
 */
export const PRODUCT_TYPES: Record<string, ProductType[]> = {
  "bathware-plumbing": [
    {
      id: "showers",
      label: "Showers & fittings",
      /* Not "overhead" on its own: the only other thing in the
         department carrying it is an overhead water tank. */
      match: ["shower"],
    },
    {
      id: "wc-cisterns",
      label: "WC & cisterns",
      /* Three spellings of the same two letters, because the term is a
         substring and `wc` bare would match inside anything. */
      match: [
        "wc ",
        "wc,",
        " wc",
        "water closet",
        "closet",
        "cistern",
        "flush plate",
        "seat cover",
      ],
    },
    {
      id: "washbasins",
      label: "Washbasins",
      match: [
        "washbasin",
        "wash basin",
        "table top basin",
        "top basin",
        "bowl basin",
        "sink basin",
      ],
    },
    {
      id: "taps-mixers",
      label: "Taps & mixers",
      match: [
        "mixer",
        "mixture",
        "bib cock",
        "pillar cock",
        "stop cock",
        "flush cock",
        "sink cock",
        "nozzle bib",
        "spout",
        "diverter",
        "machine tap",
        "concealed body",
      ],
    },
    {
      id: "health-faucets",
      label: "Health faucets",
      match: ["health faucet", "faucet"],
    },
    {
      id: "bath-accessories",
      label: "Bath accessories",
      match: [
        "towel",
        "glass shelf",
        "soap",
        "accessories collection",
        "wall bracket",
        "ring",
      ],
    },
  ],

  /* Split out of `bathware-plumbing`, which held both the sanitaryware a
     homeowner chooses and the pipework a plumber fits — 163 products in
     one grid whose two halves share no brand, no price range and no
     buyer. The reference design separates them and so does the trade.

     The shelves are the ones that moved, in the relative order they had
     inside bathware, so the move itself re-files nothing: a waste is
     still a waste before it is a pipe. */
  "plumbing-fittings": [
    {
      id: "wastes-traps",
      label: "Wastes & traps",
      match: [
        "trap",
        "waste",
        "siphon",
        "grating",
        "waste coupling",
        "collapsible",
      ],
    },
    {
      id: "valves",
      label: "Valves & cocks",
      match: ["valve", "cock", "nrv "],
    },
    {
      id: "pipes-fittings",
      label: "Pipes & fittings",
      thumbnail: ["cpvc flowguard plus pipe", "pipe"],
      match: [
        "pipe",
        "elbow",
        "tee ",
        " tee",
        "coupler",
        "coupling",
        "adapter",
        "adaptor",
        "bend",
        "union",
        "nipple",
        "reducer",
        "reducing",
        "bush",
        "end cap",
        "end plug",
        "solvent",
        "clamp",
        "tank",
        "cpvc",
        " pvc",
        "teflon",
        "fta ",
        "mta ",
        "fabt",
        "mabt",
        "fapt",
        "mapt",
      ],
    },
  ],

  "electricals-lighting": [
    {
      id: "fans",
      label: "Fans",
      thumbnail: ["ceiling fan"],
      match: ["fan ", " fan"],
    },
    {
      id: "water-heaters",
      label: "Geysers & heaters",
      thumbnail: ["geyser"],
      match: ["geyser", "water heater", "room heater", "element"],
    },
    {
      id: "power-backup",
      label: "Power backup",
      match: [" ups", "ups,", "inverter", "battery"],
    },
    {
      id: "mcb-distribution",
      label: "MCB & distribution",
      match: [
        "mcb",
        "rccb",
        "circuit breaker",
        "distribution board",
        "spn db",
        " tpn",
        "dp iso",
        "isolator",
        "sub meter",
        "panel indicator",
      ],
    },
    {
      id: "wires-cables",
      label: "Wires & cables",
      match: ["wire", "cable", "cat6", "cat 6", "lan ", "conduit", "coil"],
    },
    {
      id: "switches-sockets",
      label: "Switches & sockets",
      thumbnail: ["roma switch", "switch"],
      match: [
        "switch",
        "socket",
        "plate",
        "module",
        "plug",
        "bell",
        "back box",
        "surface box",
        "combined box",
        "regulator",
      ],
    },
    {
      id: "lighting",
      label: "Lighting",
      match: [
        "light",
        "lamp",
        "bulb",
        "batten",
        "downlight",
        "spot",
        " led",
        "cob ",
        "glow",
        "panel",
        "driver",
      ],
    },
  ],

  "tiling-adhesives": [
    {
      id: "tile-adhesive",
      label: "Tile adhesive",
      match: [
        "tile adhesive",
        "stone adhesive",
        " nca",
        " nsa",
        " vfa",
        "extrofix",
        "vitrofix",
        "dwa ",
      ],
    },
    {
      id: "grout",
      label: "Grout & fillers",
      match: ["grout", "joint filler", "tile mate"],
    },
    {
      id: "tile-cleaners",
      label: "Tile cleaners",
      match: ["cleaner", "clenza"],
    },
    {
      id: "spacers-tools",
      label: "Spacers & tools",
      match: ["spacer", "levelling", "clips", "trowel"],
    },
    {
      id: "wood-adhesive",
      label: "Wood adhesive",
      match: [
        "wood adhesive",
        "woodworking",
        "woodlok",
        "masterlok",
        "synthetic resin",
        "laminate adhesive",
        "fevicol",
        "relam",
        "heatx",
        "hi-per",
      ],
    },
    {
      id: "epoxy-sealants",
      label: "Epoxy & sealants",
      match: [
        "epoxy",
        "sealant",
        "m-seal",
        "araldite",
        "aerolite",
        "super glue",
        "instant glue",
        "bond tite",
        "pu adhesive",
      ],
    },
    {
      id: "waterproof-additives",
      label: "Waterproofing & additives",
      match: [
        "waterproof",
        "latex",
        "bonding agent",
        "damp",
        "admix",
        "preservative",
        "termite",
        "coating",
        "hydro",
      ],
    },
    {
      id: "tapes",
      label: "Tapes",
      match: ["tape"],
    },
  ],

  "paints-finishes": [
    {
      id: "wood-finishes",
      label: "Wood finishes",
      match: ["woodtech", "melamyne", "wood primer", "thinner", " pu "],
    },
    {
      id: "enamel",
      label: "Enamel",
      match: ["enamel"],
    },
    {
      id: "putty-primer",
      label: "Putty & primer",
      match: ["putty", "primer", "sealer"],
    },
    {
      id: "wall-paint",
      label: "Wall paint",
      match: [
        "emulsion",
        "apex",
        "ace,",
        "royale",
        "tractor",
        "apcolite",
        "distemper",
        "matt",
        "glitz",
      ],
    },
    {
      id: "painting-tools",
      label: "Painting tools",
      match: ["brush", "roller", "dhoti", "cloth"],
    },
  ],

  "kitchen-wardrobe-fittings": [
    {
      id: "hinges",
      label: "Hinges",
      match: ["hinge"],
    },
    {
      id: "channels-runners",
      label: "Channels & runners",
      match: ["channel", "runner", "telescopic", "tandem box", "drawer"],
    },
    {
      id: "baskets-pullouts",
      label: "Baskets & pull-outs",
      match: [
        "basket",
        "pull out",
        "pullout",
        "cargo",
        "larder",
        "pantry",
        "magic corner",
        "drainer",
        "tier",
      ],
    },
    {
      id: "wardrobe-fittings",
      label: "Wardrobe fittings",
      match: ["wardrobe", "cabinet rail", "rail support"],
    },
    {
      id: "organisers",
      label: "Organisers",
      match: ["cutlery", "orgatray", "waste-bin", "insert", "holder"],
    },
  ],

  "hardware-locks": [
    {
      id: "door-locks",
      label: "Door locks",
      match: ["lock", "latchbolt", "deadbolt", "tribolt", "hexabolt"],
    },
    {
      id: "hinges",
      label: "Hinges",
      match: ["hinge"],
    },
    {
      id: "door-hardware",
      label: "Door hardware",
      match: ["stopper", "catcher", "door"],
    },
    {
      id: "fasteners",
      label: "Fasteners",
      match: ["fastner", "fastener", "bolt", "m8 "],
    },
  ],

  "plywood-laminates": [
    {
      id: "marine-plywood",
      label: "Marine plywood",
      match: ["bwp", "marine"],
    },
    {
      id: "plywood",
      label: "Plywood",
      /* Not a bare "ply": it is inside "Greenply", which brands half
         the department including its MDF. */
      match: ["plywood", "flexiply"],
    },
    {
      id: "mdf-boards",
      label: "MDF & boards",
      match: ["mdf", "hdhmr", "board"],
    },
  ],

  "cement-steel": [
    {
      id: "cement",
      label: "Cement",
      thumbnail: ["cement 50kg"],
      match: ["cement"],
    },
    {
      id: "steel",
      label: "Steel & mesh",
      match: ["tmt", "steel", "mesh", "bars"],
    },
    {
      id: "plaster-putty",
      label: "Plaster & putty",
      thumbnail: ["putty", "plaster"],
      match: ["plaster", "putty", "primer"],
    },
  ],

  waterproofing: [
    {
      id: "coatings",
      label: "Coatings",
      match: ["coating", "coat", "damp proof", "sheath"],
    },
    {
      id: "admixtures",
      label: "Admixtures & liquids",
      match: [" lw+", "latex", "sbr", "liquid"],
    },
    {
      id: "crack-repair",
      label: "Crack repair",
      match: ["crack", "paste"],
    },
  ],

  /* Three products, and they are two unrelated things — a water heater
     and two runs of low-voltage cable. Small, but a real division: the
     rule for giving a department no shelves at all is that it has no
     honest grouping, not that it is short. */
  "home-appliances-security": [
    {
      id: "water-heaters",
      label: "Water heaters",
      match: ["water heater", "geyser"],
    },
    {
      id: "cctv-networking",
      label: "CCTV & networking",
      match: ["cctv", "cat6", "cat 6", " lan ", "cable"],
    },
  ],

  "tools-safety": [
    {
      id: "painting-tools",
      label: "Painting tools",
      match: ["brush", "roller", "sanding", "masking", "mixer", "trowel"],
    },
    {
      id: "safety",
      label: "Site safety",
      match: ["safety", "harness", "protection", "protector"],
    },
    {
      id: "storage",
      label: "Storage & racks",
      match: ["rack", "shelf", "storage"],
    },
  ],
};

/** The types a department offers, or none at all. */
export function productTypesFor(
  categorySlug: string | undefined,
): ProductType[] {
  if (!categorySlug) return [];
  return PRODUCT_TYPES[categorySlug] ?? [];
}

/**
 * One type's terms, plus every term declared above it.
 *
 * The second half is what makes the list a partition rather than nine
 * overlapping searches: a product is this type only if it matches here
 * and matched nothing more specific. Returned as plain strings so the
 * Prisma fragment is built in one place, in the data layer.
 */
export function productTypeTerms(
  categorySlug: string | undefined,
  id: string,
): { match: string[]; except: string[] } | undefined {
  const types = productTypesFor(categorySlug);
  const index = types.findIndex((t) => t.id === id);
  if (index < 0) return undefined;

  return {
    match: types[index].match,
    except: types.slice(0, index).flatMap((t) => t.match),
  };
}

/**
 * Which type a product is, by its name.
 *
 * The same first-match rule the filter applies, in JavaScript, so the
 * chip counts can be taken from one query over the department rather
 * than one count query per chip — and so the rule can be tested without
 * a database. `undefined` means the name matched nothing, which is a
 * real outcome: `CP Cap` and `Hexa Blade` are not a shelf.
 */
export function classifyProductType(
  categorySlug: string | undefined,
  name: string,
): string | undefined {
  const haystack = name.toLowerCase();
  return productTypesFor(categorySlug).find((type) =>
    type.match.some((term) => haystack.includes(term.toLowerCase())),
  )?.id;
}
